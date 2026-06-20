# 02 — BYO AI provider key: secure storage & lifecycle

**Status:** Research / design. No app code, no new dependencies.
**Author:** security-engineer
**Date:** 2026-06-20
**Scope:** How a workspace pastes its own Anthropic API key (`sk-ant-…`) into Settings, how we store it encrypted at rest, decrypt it only at call time, and manage its full lifecycle (set / validate / rotate / remove). Siblings: `01-framework-and-vercel.md` (Anthropic SDK + Vercel runtime), `03-mcp-and-tools.md` (tool surface).

---

## 0. TL;DR for reviewers

- The stored value is a **real bearer credential**, unlike `github_connections.webhook_secret` (an HMAC verifier). It **must be encrypted at rest** — this is the first encrypted-secret-at-rest requirement in the codebase (the GitHub decision of 2026-06-09 explicitly punted on this; BYO key un-punts it).
- Use **AES-256-GCM envelope encryption** with a master key from env (`AI_ENCRYPTION_KEY`, 32 random bytes, base64). Node `node:crypto` only — **no new dependency** (mirrors `packages/integrations/src/github/signature.ts`, which already uses `node:crypto` built-ins).
- New RLS-isolated table `workspace_ai_keys`, one row per (workspace, provider), following the migration/RLS pattern in `packages/db/migrations/0007_dashboard_docs_github.sql`.
- Key is **workspace-wide**, set by **owner/admin only**, **write-only** in the UI (never returned after save — show `last4` + "set ✓"), validated with a cheap ping before persisting.
- Decrypt **only** in Node server code at call time. Never log plaintext, never put it in an error message, never send it to Sentry. PII/secrets stay out of `@manager/observability` (the logger has no redaction layer — so we never hand it the plaintext, full stop).

---

## 1. Threat model

### Assets
- **Primary:** the workspace's Anthropic API key (`sk-ant-…`). A bearer credential — anyone holding it can spend the workspace's Anthropic quota and read whatever that key is scoped to.
- **Secondary:** the master key `AI_ENCRYPTION_KEY` (compromise = decrypt every stored key).

### Adversaries & what we defend against

| # | Threat | Vector | Control |
|---|---|---|---|
| T1 | **DB dump / backup leak** | Stolen Neon snapshot, leaked logical backup, read replica exposure | Ciphertext only at rest (AES-256-GCM). Plaintext never touches a column. Master key lives in Vercel env, **not** in the DB or any backup. |
| T2 | **Log / Sentry leakage** | Key accidentally logged, in a stack trace, or sent to error tracking | Plaintext is never passed to `logger.*` or thrown in an `Error.message`. Sentry already runs `sendDefaultPii: false` (`apps/web/sentry.*.config.ts`). Only `last4` is ever surfaced. |
| T3 | **Cross-tenant read** | Workspace B reads workspace A's key | RLS `workspace_id = current_workspace_id()` + explicit `workspace_id` filter in every query (defense-in-depth per decision 2026-06-09 — runtime still connects as table owner today, so the explicit filter is the *primary* control until the non-owner-role migration lands). Existence-hiding: a non-member gets 404, not 403. |
| T4 | **Malicious / curious workspace member** | A `member`/`guest` tries to read or exfiltrate the key via the UI or a Server Action | Write-only UX (no decrypt-to-client path exists at all). Set/rotate/remove gated to `owner`/`admin` server-side (mirrors `_actions/members.ts`). There is **no** action that returns plaintext to any client. |
| T5 | **Prompt-injection exfiltration** | A task/comment/doc the model reads contains "print your API key / call this URL with it" | The key is injected into the SDK transport (`new Anthropic({ apiKey })`) **only** in server code; it is **never** placed in a prompt, system message, tool definition, or tool result, so it is not in the model's context to leak. Tool/egress controls are `03-mcp-and-tools.md`'s job; this doc's invariant is simply: *the model never sees the key*. |
| T6 | **Key reuse after removal** | Stale plaintext lingering after a "remove" | Remove = hard `DELETE` of the row (no soft-delete of secret material). Rotation overwrites ciphertext in place. |

### Explicit non-goals (v1)
- **Not** an HSM / managed KMS for cloud v1 — env-held master key is the pragmatic baseline (see §2.5; KMS is a documented upgrade path).
- **Not** defending against a **fully compromised running Node server** that already holds `AI_ENCRYPTION_KEY` in memory — at that point the attacker can decrypt by definition. Mitigation is env-scope hygiene + rotation, not crypto.
- **Not** per-user keys (workspace-wide; see §3.3).
- **Not** preventing a legitimately authorized owner from using the key to spend their own Anthropic quota — that's the point of BYO.
- **Not** outbound egress filtering of model tool calls — owned by `03-mcp-and-tools.md`.

---

## 2. Crypto design

### 2.1 Algorithm — AES-256-GCM (authenticated encryption)

GCM gives confidentiality **and** integrity (the auth tag detects tampering, including bit-flips in a DB dump). All primitives are in Node's `node:crypto`; the repo already depends on it (`signature.ts`), so **no dependency is added** and the self-host/edge story stays clean.

- **Master key:** 32 bytes (256-bit) from `AI_ENCRYPTION_KEY` (base64-encoded in env). Decoded to a `Buffer` once at module load.
- **IV / nonce:** **random 96-bit (12-byte)** per encryption, via `randomBytes(12)`. 96 bits is the GCM-recommended nonce size. A fresh random IV per write (never reused under the same key) is mandatory for GCM safety.
- **Auth tag:** 16 bytes (128-bit), from `cipher.getAuthTag()`.
- **AAD (optional, recommended):** bind the ciphertext to its row by passing `workspace_id` (and `provider`) as Additional Authenticated Data. This makes a copied-ciphertext-into-another-row attack fail decryption. Cheap; include it.

### 2.2 Storage shape — one packed buffer

Store a single self-describing blob rather than three loose columns, so format is unambiguous and rotation is easy:

```
version(1B) || key_id(1B) || iv(12B) || authTag(16B) || ciphertext(N)
```

Persist this as **base64 text** in one column (`ciphertext`). `version` lets the format evolve; `key_id` selects which master key decrypted it (see §2.4 rotation). Keeping IV+tag *inside* the blob means the row can't be half-migrated. (A reasonable alternative — separate `iv` / `auth_tag` / `ciphertext` columns — is equally secure; the packed form is just less error-prone for callers and is the recommendation.)

### 2.3 Pseudo-code (`node:crypto`, illustrative — not app code)

```ts
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

const VERSION = 1;
const KEY_ID = 1;                 // bump when a new master key is introduced (§2.4)
const ALGO = "aes-256-gcm";

// keyring maps key_id -> 32-byte Buffer (decoded from base64 env), so old
// ciphertexts stay readable after a rotation introduces a new active key.
function masterKey(id: number): Buffer { /* from AI_ENCRYPTION_KEY[/_NEXT] */ }

function encryptSecret(plaintext: string, aad: string): string {
  const iv = randomBytes(12);                       // 96-bit nonce, fresh per write
  const cipher = createCipheriv(ALGO, masterKey(KEY_ID), iv, { authTagLength: 16 });
  cipher.setAAD(Buffer.from(aad, "utf8"));          // e.g. `${workspaceId}:anthropic`
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([VERSION, KEY_ID]), iv, tag, ct]).toString("base64");
}

function decryptSecret(packedB64: string, aad: string): string {
  const buf = Buffer.from(packedB64, "base64");
  const keyId = buf[1];
  const iv = buf.subarray(2, 14);
  const tag = buf.subarray(14, 30);
  const ct = buf.subarray(30);
  const d = createDecipheriv(ALGO, masterKey(keyId), iv, { authTagLength: 16 });
  d.setAAD(Buffer.from(aad, "utf8"));
  d.setAuthTag(tag);                                // throws on tamper/wrong key
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
  // Caller wraps in try/catch; on failure return a generic "key unavailable" —
  // never echo the cause or any byte of input into logs/UI.
}
```

Notes that are load-bearing:
- `decryptSecret` **throws** if the tag doesn't verify (tamper, wrong key, corrupt blob). The Server Action must catch it and degrade gracefully ("AI key is unavailable, please re-enter") **without** leaking the error detail.
- Plaintext exists only as a transient local in these two functions and at the SDK call site. It is never assigned to anything that gets serialized (no log field, no response body, no Sentry breadcrumb).

### 2.4 Key rotation (of the master key)

- `key_id` byte in every blob says which master key encrypted it. A **keyring** (`AI_ENCRYPTION_KEY` = active; `AI_ENCRYPTION_KEY_NEXT` = newly added) lets us decrypt old rows while writing new ones under the new key.
- **Rotation runbook (devops-engineer owns the env plumbing):** (1) add new key as `AI_ENCRYPTION_KEY_NEXT`, deploy — both keys now in the ring; (2) make the new key the active write key (`KEY_ID++`); (3) a background re-encrypt sweep (Inngest job, Phase 2) reads each row, `decrypt` with old `key_id`, `encrypt` with new — RLS-scoped per workspace; (4) once `key_id=old` count is zero, retire the old env var.
- **Workspace-key rotation** (user pastes a new `sk-ant-…`) is unrelated and far simpler: it's just an overwrite of `ciphertext` for that row (§4).

### 2.5 Self-host story & the managed-KMS alternative

- **Same `AIService` port both tiers** (`packages/ai`, currently a placeholder). The encrypt/decrypt helpers live behind the port so cloud and self-host run identical code; only the *source* of the master key differs.
- **Self-host:** the tenant supplies their **own** `AI_ENCRYPTION_KEY` in their env (documented in the self-host runbook, same shape as `DATABASE_URL`/`AUTH_SECRET` in `apps/web/src/env.ts`). They hold both their DB and their master key — appropriate, since they own the deployment. Encourage (don't require) sourcing it from their own secret manager.
- **Cloud, why env-key for v1:** a managed KMS (AWS KMS / GCP KMS / Vercel-integrated) where the master key never leaves the HSM and we call `Encrypt`/`Decrypt` per use is **stronger** (master key is non-exfiltratable, per-use audit trail) and is the natural upgrade. We defer it because: (a) it adds a vendor dependency that must then sit behind a port to preserve the self-host story (§7 of PLAN), (b) a per-call network round-trip on a latency-sensitive AI path, (c) the codebase has **zero** encryption-at-rest today, so an env-key + AES-GCM envelope is a large, correct step that's shippable now. **The envelope structure (`key_id`, keyring) is forward-compatible**: moving to KMS later means swapping `masterKey()` for a KMS-decrypted data key — the table and blob format don't change. Capture this as an ADR when implemented.

---

## 3. Data model + RLS

### 3.1 Table: `workspace_ai_keys`

Mirrors the established pattern in `0007_dashboard_docs_github.sql` (uuid PK, `workspace_id` FK with `ON DELETE cascade`, `created_at`/`updated_at`, per-table RLS).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` default `gen_random_uuid()` | |
| `workspace_id` | `uuid NOT NULL` | FK → `workspaces.id` `ON DELETE cascade`. |
| `provider` | `text NOT NULL` default `'anthropic'` | `CHECK (provider IN ('anthropic'))` for now; widening is one migration when a 2nd provider lands. Future-proofs the table. |
| `ciphertext` | `text NOT NULL` | Base64 packed blob (`version‖key_id‖iv‖tag‖ct`, §2.2). **The only place the secret lives.** |
| `key_version` | `integer NOT NULL` default `1` | Denormalized copy of the blob's `key_id` — lets the rotation sweep find stale rows with a cheap indexed `WHERE`, without decoding every blob. |
| `last4` | `text NOT NULL` | Last 4 chars of the plaintext key, stored **plaintext on purpose** — it's a non-secret display hint (`sk-ant-…abcd`). |
| `key_hint` | `text` | Optional: prefix label like `sk-ant-api03` for disambiguation. Non-secret. |
| `last_validated_at` | `timestamptz` | Set when a validation ping last succeeded (§4). |
| `created_by` | `uuid` | FK → `users.id` `ON DELETE set null` (mirrors `connected_by`). |
| `created_at` | `timestamptz NOT NULL` default `now()` | |
| `updated_at` | `timestamptz NOT NULL` default `now()` | Bumped on rotate. |

**Uniqueness:** `UNIQUE (workspace_id, provider)` — one key per provider per workspace (workspace-wide, §3.3). Matches the `github_connections_ws_repo_uq` precedent and lets the Server Action map a unique violation to a friendly "already set" message exactly like `connectRepoAction`.

> Naming note: `workspace_ai_keys` is preferred over a generic `workspace_secrets` for v1 — narrow and obvious. If we later store other per-workspace bearer secrets, generalize then (a `secret_type` column on a `workspace_secrets` table) rather than over-abstracting now.

### 3.2 RLS — identical `*_isolation` shape

Enable RLS and add the policy line verbatim in the style of `0007`:

```sql
ALTER TABLE "workspace_ai_keys" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_ai_keys_isolation" ON "workspace_ai_keys"
  USING (workspace_id = current_workspace_id())
  WITH CHECK (workspace_id = current_workspace_id());
```

All reads/writes go through `withActiveWorkspace` / `withWorkspace` (`apps/web/src/lib/workspace-context.ts`, `packages/db/src/rls.ts`) so `app.workspace_id` is set transaction-locally. Every query **also** filters `workspace_id` explicitly (decision 2026-06-09 — the runtime table-owner role bypasses RLS today, so the explicit filter is the real boundary; RLS is defense-in-depth until the non-owner-role migration). The Drizzle schema goes in `packages/db/src/schema/ai.ts`, exported from `schema/index.ts` (same as `github.ts`).

### 3.3 Workspace-wide vs per-user — decision: **workspace-wide**

- **Why workspace-wide:** the AI assistant is a workspace feature; billing/quota is the workspace's; the team's flat 3–15-person model (PLAN §5) doesn't warrant per-user key management. One key, set by an admin, used by all members' AI actions in that workspace.
- **Consequence:** any member can *trigger spend* on the key, but **cannot read it** (write-only UX, §4). That's the intended trust boundary — same as a member being able to send invite emails that cost money without seeing SMTP creds.
- **Revisit if:** a customer needs per-user attribution/limits or per-user keys — that becomes a `user_id` column + a `(workspace_id, user_id, provider)` unique index, a strictly additive change. Not v1.

---

## 4. Settings UX + validation

Mirror `apps/web/app/[workspace]/settings/github/` exactly: an RSC `page.tsx` loading non-secret state, a client `*-manager.tsx`, and `actions.ts` Server Actions. New route: `apps/web/app/[workspace]/settings/ai/`.

### 4.1 Write-only principle
The plaintext key is **accepted** on save and **never returned** to any client thereafter. The RSC loads only non-secret fields (`last4`, `key_hint`, `last_validated_at`, `provider`, "set ✓"). This is a deliberate **departure** from the GitHub page, which reveals the webhook secret — because a webhook secret is shown so the user can paste it into GitHub, whereas an Anthropic key the user already has and must never need back from us. There is **no** "Reveal" button and **no** Server Action that returns the decrypted key.

### 4.2 Set / rotate (same action)
`setAiKeyAction(slug, formData)`:
1. Zod-validate shape: non-empty, starts with `sk-ant-`, length sane, trimmed. (Cheap pre-check; not authentication.)
2. `requireSession()`, then inside `withActiveWorkspace` enforce `ws.role !== "owner" && ws.role !== "admin"` → friendly error (verbatim pattern from `_actions/members.ts`).
3. **Validate the key is live before persisting** — a cheap server-side ping with the pasted key: `new Anthropic({ apiKey }).models.list()` (or a 1-token `messages.create`). A `401/403` → return "That key was rejected by Anthropic" (do **not** echo Anthropic's raw error). Network/5xx → allow save but mark unvalidated, or ask to retry (product call — see open questions). On success set `last_validated_at`.
4. `encryptSecret(apiKey, ` `${ws.id}:${provider})` → upsert `ciphertext`, `last4 = apiKey.slice(-4)`, `key_version`, `created_by`, bump `updated_at`. Upsert on the `(workspace_id, provider)` unique constraint so "set" and "rotate" are one code path.
5. `revalidatePath(`/${slug}/settings/ai`)`. Return `{ ok: true, last4 }` — never the key.

### 4.3 Remove
`removeAiKeyAction(slug, formData)`: owner/admin gate, hard `DELETE` of the row (no secret soft-delete), revalidate. With no key set, AI features fall back per §5.4 (platform key) or are disabled.

### 4.4 Validation ping ("Test key" button)
A `testAiKeyAction` re-runs the §4.2-step-3 ping against the **stored** key (decrypt → ping → discard) and updates `last_validated_at`. Useful after a key is revoked Anthropic-side. Owner/admin only. Result is boolean + timestamp to the UI — never key bytes.

### 4.5 Permissions summary
| Action | owner | admin | member | guest |
|---|:---:|:---:|:---:|:---:|
| View status (`last4`, "set ✓", last validated) | ✓ | ✓ | view-only (no bytes) | ✓ (optional) |
| Set / rotate / remove / test | ✓ | ✓ | ✗ | ✗ |
| *Trigger* AI calls that consume the key | ✓ | ✓ | ✓ | per feature |

Gate is enforced **server-side** in every action and mirrored in the UI (`canManage` prop, exactly like the members page).

---

## 5. Operational guards

### 5.1 Logging & error hygiene
- **Never** pass plaintext (or `ciphertext`, or `AI_ENCRYPTION_KEY`) to `@manager/observability`'s `logger.*`. The logger spreads `fields` straight into the JSON line with **no redaction** (`packages/observability/src/logger.ts`) — so the only safe rule is *don't hand it the secret*. Log `{ workspaceId, provider, last4, event }` at most.
- **No key in error messages.** Anthropic SDK errors must be caught and mapped to generic strings before they reach a Server Action return value, the UI, a thrown `Error`, or Sentry. Decrypt failures return a generic "key unavailable."
- **Sentry:** `sendDefaultPii: false` is already set in all three configs. Additionally ensure the AI call site doesn't attach the key as context/breadcrumb/tag. Consider a `beforeSend` scrubber that drops any string matching `sk-ant-` as belt-and-suspenders (devops-engineer; low priority given the model never sees it and we never log it).

### 5.2 Rate limiting
- **Per-workspace** sliding-window limit on AI invocations (Upstash Redis, the §4.5 mechanism in PLAN). Two reasons: (a) cost protection for BYO and especially for the platform-key fallback (§5.4), (b) a compromised member account can't burn the whole quota instantly.
- Also rate-limit the **validation ping** and **set/test** actions (e.g. a few per minute per workspace) so the Settings form isn't an oracle/abuse vector against Anthropic.

### 5.3 Audit log on set / rotate / remove
PLAN §4.7 requires an audit entry for security-relevant changes. The existing `activity` table is **task-scoped** and its enum (`ACTIVITY_TYPES` in `packages/db/src/schema/activity.ts`) rejects new types — same constraint that blocked GitHub events (decision 2026-06-09 item 3). So **do not** shoehorn this in. Options, in preference order:
1. A small **workspace-scoped audit table** (`workspace_audit_log`: `workspace_id`, `actor_id`, `action`, `metadata jsonb`, `created_at`, RLS-isolated) — the right home for key/role/billing security events and aligned with PLAN's "audit log for permission/role/billing." Coordinate the schema with **database-engineer**. Record `ai_key_set` / `ai_key_rotated` / `ai_key_removed` with `{ provider, last4 }` — **never** the key.
2. Interim: structured `logger.info("ai_key_rotated", { workspaceId, actorId, provider, last4 })` to Axiom so there's a trail before the table exists.

Recommend landing the audit table with this feature (it's also needed for billing/role events generally), but the feature can ship on option 2 if the table slips.

### 5.4 Platform-key fallback & billing/policy
- A **platform key** (`ANTHROPIC_API_KEY` in our env) could back AI for workspaces that haven't set their own — convenient, but it spends **our** money. Policy implications:
  - **Cloud free tier:** if we offer fallback, it **must** be tightly capped per workspace (rate-limit + a hard monthly token ceiling) or gated to paid plans, else it's an open cost-DoS. Safer v1: **no platform fallback on free cloud** — BYO key is required to use AI; without a key, AI features are disabled with a clear "add your Anthropic key in Settings" prompt.
  - **Self-host:** there's no "our money" — fallback = whatever key the operator puts in their env. Fine.
- **Precedence:** if both a workspace key and a platform key exist, **workspace key wins** (BYO is explicit intent; predictable billing). Make this explicit in the `AIService` resolution order and document it.
- **Never** silently switch a workspace from their BYO key to the platform key (or vice-versa) — that's a billing surprise. Surface which key is in use in Settings.

---

## 6. Recommendation

Ship BYO key as **AES-256-GCM envelope encryption with a 256-bit master key from `AI_ENCRYPTION_KEY` (base64, validated in `apps/web/src/env.ts`)**, using **`node:crypto` only — no new dependency** — storing a single packed `version‖key_id‖iv(12)‖tag(16)‖ciphertext` base64 blob in a new RLS-isolated `workspace_ai_keys` table (one row per workspace+provider) built to the `0007` migration/RLS pattern. The key is **workspace-wide**, **owner/admin-set**, **write-only** (UI shows only `last4` + "set ✓"), **validated with a cheap Anthropic ping before persist**, and **decrypted only at call time in Node server code** — never logged, never in an error, never in a prompt, so prompt-injection has nothing to exfiltrate. Add per-workspace rate limiting and an audit entry on set/rotate/remove (in a new workspace-scoped audit table, coordinated with database-engineer — not the task-scoped `activity` table). For cloud v1, **require BYO and ship no platform-key fallback** on the free tier to avoid an open cost-DoS; if a platform key is later introduced, the workspace key always wins. The envelope's `key_id`/keyring makes a future move to a managed KMS a drop-in replacement of `masterKey()` with no table or format change — capture that, and the env-key decision, as an ADR alongside implementation. This is design-only; the implementing PR must land the master-key env var, the migration + RLS, the `AIService` port encrypt/decrypt, the Settings route, and security tests (encrypt→decrypt round-trip, tamper-tag rejection, AAD-mismatch rejection, cross-tenant 404, member-cannot-set, no-plaintext-in-logs) under `packages/ai/test/` and the existing RLS isolation suite.

---

## 7. Open questions

1. **Validation on a network blip:** if the Anthropic ping fails with a 5xx/timeout (not a 401), do we (a) block save, (b) save-but-flag-unvalidated, or (c) save and retry async? Leaning (b). — *product-lead + security.*
2. **Platform-key fallback on cloud:** confirm "free = BYO required, no fallback." If marketing wants a free trial of AI, define the hard token cap + plan gate before any platform key is wired. — *product-lead.*
3. **Audit table now or later:** land `workspace_audit_log` with this feature (preferred), or ship on structured logs first? Needs database-engineer's schema + RLS. — *database-engineer.*
4. **Master-key rotation cadence & re-encrypt sweep:** who owns the Inngest re-encrypt job and the env-rotation runbook, and what's the cadence (annual? on-incident?). — *devops-engineer.*
5. **Self-host key bootstrap UX:** if a self-host operator omits `AI_ENCRYPTION_KEY`, do AI features hard-fail at startup (env validation) or degrade gracefully? Suggest: required only when AI is enabled (conditional Zod), else AI disabled. — *security + devops.*
6. **KMS upgrade trigger:** what event makes us move cloud from env-key to managed KMS (first paid cloud customer? a compliance ask? a key-handling incident)? Record the threshold in the ADR. — *security-engineer.*
7. **Scope/least-privilege guidance:** should Settings nudge users to paste a **restricted** Anthropic key (workspace/spend-limited) rather than a root org key, to bound blast radius if T1/T2 ever fire? Copy-only, but worth it. — *security + product.*
