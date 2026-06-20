# ADR 0002 — AI assistant: SDK, runtime, BYO key, and tools

- Status: proposed
- Date: 2026-06-20
- Decision drivers: PLAN.md §2 (Phase 4 "Inline AI assist … Anthropic Claude API"), §4.5 (runtime/concurrency budget), §7 (vendor ports / self-host), and a product request to add an AI assistant deployed on Vercel with a user-supplied API key in Settings.
- Backed by research: [`docs/research/ai/`](../research/ai/) — `01-framework-and-vercel.md`, `02-byo-key-storage.md`, `03-mcp-and-tools.md`.

## Context

We want an in-app AI assistant (chat + task actions), deployed on Vercel first, with each workspace able to paste its own Anthropic API key in Settings. The app is self-host-first (paid tier), multi-tenant via Postgres RLS, and already ships an MCP server (`packages/mcp`) plus a `/api/v1` REST surface. `packages/ai` is currently a stub.

## Decision

### 1. Framework — official SDK behind an `AIService` port
Wrap the official **`@anthropic-ai/sdk`** behind a new **`AIService`** port in `packages/ai`, consumed through an `aiService()` factory gated by an `AI_ENABLED` flag — identical to the existing `@manager/realtime`, `@manager/search`, and `@manager/email` ports (ADR 0001). The vendor SDK appears only inside the adapter file; the ESLint `no-restricted-imports` rule gains an `@anthropic-ai/sdk` entry.

**We do not adopt the Vercel AI SDK** (`ai` / `@ai-sdk/anthropic`). It wraps the provider and adds Vercel-flavored lock-in to a self-host-first product; its `useChat` convenience is replaceable by a small client-side reader over our own stream.

### 2. Runtime on Vercel
Stream from a **Node-runtime Route Handler** (`export const runtime = "nodejs"`) returning a `ReadableStream` fed by `client.messages.stream(...)` → `finalMessage()`. Node is required (the `postgres-js` driver can't run on Edge). Keep each turn within the §4.5 5s budget; push long agentic loops and batch operations to **Inngest** (still an unwired stub — wiring it gates the Phase-2+ agentic/tool work).

### 3. Model & cost
Default **`claude-opus-4-8`** with adaptive thinking (`thinking: { type: "adaptive" }`) and `output_config.effort`; drop to **`claude-sonnet-4-6`** / **`claude-haiku-4-5`** for cheap or bulk turns. The primary cost lever is **prompt caching** of the frozen system-prompt + tool-list prefix (`cache_control: { type: "ephemeral" }` on the last stable block; 4096-token minimum on Opus). Indicative pricing per 1M tokens (in/out): Opus 4.8 $5/$25, Sonnet 4.6 $3/$15, Haiku 4.5 $1/$5.

### 4. BYO per-workspace API key
A pasted Anthropic key is a real bearer credential, so it is **encrypted at rest with AES-256-GCM** via `node:crypto` (no new dependency), keyed by a new `AI_ENCRYPTION_KEY` env var (32 bytes), random 96-bit IV per write, AAD-bound to the row, stored as a packed `version‖key_id‖iv‖tag‖ciphertext` blob in a new **RLS-isolated `workspace_ai_keys` table** (one row per workspace+provider, owner/admin-set). Decryption happens only at call time in Node; plaintext is never logged, never placed in a prompt. A write-only Settings page shows only `last4` + "set ✓", validates the key with a cheap ping before persisting, and supports rotate/remove with an audit-log entry. Self-host uses the same port; the tenant supplies their own `AI_ENCRYPTION_KEY`. Free cloud = BYO key required (no platform-key fallback in v1).

### 5. Tools / MCP
The assistant gets actions via **in-process custom tools** for the MVP — tool calls handled in the Next.js server, calling the same internal functions behind `/api/v1`, so every call runs through `withActiveWorkspace`/RLS and never trusts model-supplied IDs. The **MCP connector** (beta) is a fast-follow that lets the same tool contracts serve both the in-app assistant and external agents/Claude Desktop. In-process tools are also the self-host path (the MCP connector is beta and first-party/AWS-only). Writes use propose → confirm → apply, idempotency keys, and per-workspace rate limits.

## Consequences

- **Pro**: zero provider lock-in; the assistant works identically on cloud and self-host through one port. Tool calls reuse the existing, RLS-safe `/api/v1` surface.
- **Pro**: BYO-key model means cloud inference cost is borne by the workspace, fitting the free-cloud / paid-self-host revenue model.
- **Con**: introduces the project's first encryption-at-rest primitive and its first streaming Route Handler — both need careful review (keys: lead-audit; streaming: tech-lead/backend-lead).
- **Con**: Inngest must finally be wired for anything beyond single-turn/short interactions.

## Enforcement
- Add `@anthropic-ai/sdk` to the ESLint `no-restricted-imports` list; SDK only inside `packages/ai/src/*-adapter.ts`.
- `AI_ENCRYPTION_KEY` validated in `apps/web/src/env.ts`; missing key disables the AI feature rather than 500-ing.
- New `workspace_ai_keys` table ships with a `*_isolation` RLS policy and an isolation test, mirroring migration `0007`.

## Open questions
- Platform-key fallback for a future paid cloud tier (billing/policy) — deferred.
- Per-user vs per-workspace key — defaulting to per-workspace; revisit if teams want individual keys.
- When to promote the MCP connector from fast-follow to default (depends on hosting the MCP server over HTTPS with per-workspace PATs).
- Inngest wiring scope (the `JobQueue` port from ADR 0001) — size before Phase-2 agentic work.
