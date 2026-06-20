# 01 — AI Assistant: Framework & Vercel Architecture

Research note. Scope: **which SDK/framework** to build the Phase 4 in-app AI
assistant on, **where it runs** on Vercel, the **model + cost** defaults, and the
shape of the `AIService` **port**. Recommendation only — **no app code, no deps
added** by this note (the `packages/ai` stub stays a stub until Phase 4 starts,
per PLAN §2 and the 2026-05-14 decision "no AI SDKs land before then").

Sibling notes: `02-byo-key-storage.md` (where the per-workspace Anthropic key
lives — owns key storage, encryption, and the per-turn cost/token ceiling) and
`03-mcp-and-tools.md` (how the assistant calls Manager actions — owns the tool
surface and the MCP connector). **This note owns the runtime, streaming, SDK
choice, and the port; it defers key storage to `02` and tools/MCP to `03`** and
does not duplicate them.

**TL;DR.** Wrap the official **`@anthropic-ai/sdk`** behind an **`AIService`
port** in `packages/ai` — exactly the §7 pattern already shipped for
`@manager/realtime` / `@manager/search` / `@manager/email`. **Do not adopt the
Vercel AI SDK**; stream directly from the Anthropic SDK through a **Node-runtime
Route Handler** using `client.messages.stream(...)`. Default model **Opus 4.8**
(`claude-opus-4-8`); drop to Sonnet/Haiku for cheap/bulk work. Long agentic loops
go to **Inngest** (not wired yet — Phase 2+). Prompt caching on the frozen system
prompt + tool list is the main cost lever.

---

## 1. Framework recommendation

### Decision: official `@anthropic-ai/sdk` behind an `AIService` port

The project is TypeScript and every non-portable vendor sits behind an internal
interface (PLAN §7, ADR 0001). Claude is exactly such a vendor, so it gets the
same treatment as Ably/Resend/Postgres-FTS:

- **One adapter file** (`packages/ai/src/anthropic-adapter.ts`) is the **only**
  place that imports `@anthropic-ai/sdk`. Add `@anthropic-ai/sdk` (and, if it's
  ever introduced, `ai` / `@ai-sdk/anthropic`) to the ESLint
  `no-restricted-imports` rule in `packages/config/eslint.config.mjs` so the SDK
  can't leak into app code — ADR 0001 already says "add more as new vendors
  land".
- The app depends only on the `AIService` **interface** (`packages/ai/src/types.ts`),
  never on the SDK — identical to how `apps/web/src/lib/realtime.ts` depends on
  `RealtimeService`, not on `ably`.

Use the **official TypeScript SDK**, not an OpenAI-compatible shim: it's the
first-party, typed surface for the features this assistant needs (adaptive
thinking, prompt caching, streaming, the MCP connector for the `03` fast-follow).

### Should we also adopt the Vercel AI SDK (`ai` + `@ai-sdk/anthropic`)? — No.

The Vercel AI SDK (`streamText`, the `useChat` React hook) is a legitimate
Vercel-native option for the streaming/UI plumbing, and `useChat` is genuinely
nice DX. But it **wraps the provider**, and that conflicts with the project's
core constraint.

| Dimension | `@anthropic-ai/sdk` behind our port | Vercel AI SDK (`ai` + `@ai-sdk/anthropic`) |
|---|---|---|
| Fits §7 / ADR 0001 | ✅ It *is* the port's adapter | ⚠️ A second abstraction *over* the provider, on top of our own port — two wrappers |
| Self-host portability | ✅ Port already abstracts cloud↔self-host; key is swapped per tenant | ⚠️ Couples our streaming/UI layer to a Vercel-branded lib for a self-host product whose paid tier is the whole point |
| Anthropic feature access | ✅ Direct: `thinking: {type:"adaptive"}`, `output_config.effort`, `cache_control`, MCP connector beta header, `client.messages.stream()` | ⚠️ Indirect — provider-specific params (effort, adaptive thinking, cache breakpoints) are passed through provider options and lag the first-party SDK |
| `useChat` DX | ➖ We hand-roll a small chat hook over a fetch stream (one component) | ✅ `useChat` out of the box |
| Lock-in | ✅ None beyond Anthropic itself (already a port) | ⚠️ Adds `ai` + `@ai-sdk/*` to the dependency surface and a Vercel-aligned wire protocol |
| Tool loop / MCP (`03`) | ✅ Tool runner + MCP connector are first-party in `@anthropic-ai/sdk` | ⚠️ Re-expresses tools in the AI SDK's own shape; `03`'s "one Zod schema, two bindings" plan assumes the Anthropic tool runner |

**Firm pick: stream directly from `@anthropic-ai/sdk` via a Route Handler.** The
`useChat` convenience does not outweigh adding a provider-wrapping dependency to a
self-host-first product that already mandates ports. The client side is a small
fetch-driven reader over our own SSE/stream endpoint (see §2); the lost DX is one
modest hook, owned by `frontend-engineer`. If the team later wants `useChat`
specifically, it can sit on top of our port's stream without the
`@ai-sdk/anthropic` provider — but that's not recommended for the MVP.

---

## 2. Vercel architecture

### Where it runs

The model call must run **server-side on the Node runtime**. This is forced, not
chosen: every DB-touching route in the repo declares `export const runtime =
"nodejs"` because the `postgres-js` driver needs `net`/`tls`/`stream`, which Edge
doesn't provide (`docs/deploy/vercel.md`; confirmed across
`apps/web/app/api/**/route.ts`). Tool calls (`03`) hit the DB via
`withActiveWorkspace`, and the BYO key is resolved server-side (`02`) — both
require Node.

| Surface | Use it for | Why |
|---|---|---|
| **Route Handler** (`app/api/ai/.../route.ts`, `runtime = "nodejs"`) | The streaming chat/assist endpoint | Streaming responses need a Response body you control; Route Handlers can return a `ReadableStream`. Mirrors `realtime/token/route.ts`. **Recommended primary surface.** |
| **Server Action** (`"use server"`) | Single-shot, non-streamed assist (e.g. "draft acceptance criteria" returning one block) | Matches the existing `_actions/*.ts` pattern (Zod-validated, `withActiveWorkspace`, returns a plain object). Server Actions can't stream incrementally to the browser, so use them only for short, bounded outputs. |
| **Inngest step function** (`@manager/jobs`) | Long agentic loops, batch ops (bulk task breakdown, multi-doc summarize) | Anything that can exceed the request budget. **Not wired yet** — see below. |

### Streaming to the browser

There is **no streaming pattern in the repo today** — this note introduces it.
The Route Handler returns a `ReadableStream` (SSE or a raw text stream) fed by the
Anthropic SDK's streaming helper:

```ts
// apps/web/app/api/ai/assist/route.ts (sketch — not wired)
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // session + tenant scope exactly like realtime/token/route.ts
  // BYO/platform key resolved per `02-byo-key-storage.md`
  // tools resolved per `03-mcp-and-tools.md`
  // aiService().streamChat(...) wraps client.messages.stream({...});
  //   await stream.finalMessage() yields the complete Message at the end.
  // Pipe stream deltas into a ReadableStream returned as the Response body.
}
```

Streaming is **required** for the chat surface: the assistant's outputs (task
breakdowns, thread summaries) are large, and a non-streamed request risks the
Vercel function/HTTP timeout. With streaming, default `max_tokens` ~64000 (the
project doesn't need 128K outputs for assist tasks). The client reads the stream
with a small fetch loop (no `useChat` dependency — see §1).

### The 5s budget vs the function ceiling → push to Inngest

PLAN §4.5 sets a hard rule: **no request handler runs longer than 5s; anything
heavier is enqueued.** The Vercel platform ceiling is higher (import routes are
bumped to `maxDuration = 30` in `vercel.json`), but 5s is the project's
self-imposed budget. The implication for AI:

- **Interactive single-turn assist + streaming chat fit the budget** — an Opus
  call streams first tokens quickly and the user watches it arrive; the *handler*
  isn't blocked computing for 5s, it's relaying a stream. Set a generous
  `maxDuration` on the AI route (like the import routes) to cover slow streams,
  but keep the *work* per turn bounded.
- **Long agentic loops and batch ops exceed the budget and must go to Inngest**
  — a multi-step tool loop (search → read N tasks → create M subtasks → verify),
  bulk "break down every task in this sprint", or scheduled summaries. These are
  exactly PLAN §4.5's "long-running (>10s) → Inngest step function" row.

**Inngest is not wired yet.** `@manager/jobs` is a 3-line stub
(`packages/jobs/src/index.ts`), and the decision log defers Inngest to Phase 2
(digests, reminders, outbound webhooks). When it lands it gets a `JobQueue` port
(ADR 0001 "Explicit non-abstractions"). So: **MVP assist runs entirely in the
Route Handler; agentic/batch AI is a Phase-2+ follow-on gated on Inngest landing.**

### Fit with the existing topology (PLAN §4.1)

The assistant slots into the existing Vercel box with no new infra: Node Route
Handler → `withActiveWorkspace` (RLS) → tool handlers calling
`apps/web/src/server/*` and `@manager/db/queries` (`03`) → Neon. The only new
outbound dependency is the Anthropic API, reached **only** through the
`packages/ai` adapter. Upstash Redis (already in the topology) is where the
per-workspace AI rate limit and the per-turn cost ceiling live (`02`, `03`).
Streaming progress can optionally surface over the existing Ably channel for
Inngest-backed long jobs, but the interactive path streams directly from the
handler.

---

## 3. Model & cost

**Default: Opus 4.8 (`claude-opus-4-8`).** It's the capable default for the
assistant's reasoning-shaped jobs (task breakdown, drafting acceptance criteria,
summarizing threads with judgment). Use `thinking: {type: "adaptive"}` with
`output_config: {effort: "high"}` for quality work; drop `effort` to `medium`/`low`
for cheaper turns. Note Opus 4.8 rejects `temperature`/`top_p`/`top_k` (400) —
steer via prompting, not sampling params.

**When to drop down:**

- **Sonnet 4.6 (`claude-sonnet-4-6`)** — high-volume or latency-sensitive turns
  where Opus-grade reasoning isn't needed (quick rewrites, short summaries,
  classify/label). ~40% cheaper input, ~40% cheaper output than Opus.
- **Haiku 4.5 (`claude-haiku-4-5`)** — cheap/bulk/simple: title suggestions,
  one-line summaries, fan-out over many items where each call is trivial. Cheapest
  tier; 200K context (vs 1M on Opus/Sonnet).

Model is per-call on the `AIService` port (§4), so the caller picks the tier per
job; the BYO-key cost ceiling that bounds spend per turn lives in `02`.

### Cost table (per 1M tokens)

| Model | ID | Input | Output | Context | Max output |
|---|---|---:|---:|---:|---:|
| Opus 4.8 (default) | `claude-opus-4-8` | $5 | $25 | 1M | 128K |
| Sonnet 4.6 | `claude-sonnet-4-6` | $3 | $15 | 1M | 64K |
| Haiku 4.5 | `claude-haiku-4-5` | $1 | $5 | 200K | 64K |

### Prompt caching is the main cost lever

The assistant carries a **long, stable system prompt + tool list** (the tool
surface from `03`). Caching that frozen prefix is the single biggest cost
reduction:

- Put `cache_control: { type: "ephemeral" }` on the **last stable prefix block**.
  Render order is **tools → system → messages**, so a breakpoint on the last
  system block caches tools + system together.
- **Keep the system prompt and tool list byte-frozen at the front; put volatile
  content (the user's message, per-turn context) last**, after the breakpoint. Any
  byte change in the prefix invalidates everything after it — so do **not**
  interpolate timestamps, workspace IDs, or per-request data into the system
  prompt.
- **Opus minimum cacheable prefix is 4096 tokens** — a shorter prefix silently
  won't cache. The combined system prompt + tool list should clear that easily.
- **Economics:** cache reads ≈ 0.1× input price; writes ≈ 1.25× (5-min TTL). With
  a chatty multi-turn session the frozen prefix is written once and read on every
  subsequent turn — a large net saving on a tool-heavy assistant.
- Verify with `usage.cache_read_input_tokens`; if it's zero across turns, a silent
  invalidator is in the prefix.

---

## 4. `AIService` port sketch

Design artifact only — **not wired into the app.** Lands in
`packages/ai/src/types.ts` (interface) + `packages/ai/src/anthropic-adapter.ts`
(the one SDK importer), re-exported from `packages/ai/src/index.ts`, following the
exact file layout of `@manager/realtime` / `@manager/search` / `@manager/email`.

```ts
// packages/ai/src/types.ts — design sketch, not implemented
export type AIModel =
  | "claude-opus-4-8"      // default — capable work
  | "claude-sonnet-4-6"    // cheaper / faster
  | "claude-haiku-4-5";    // cheapest / bulk

export type AIEffort = "low" | "medium" | "high" | "xhigh" | "max";

export interface AIMessage {
  role: "user" | "assistant";
  content: string; // (content blocks once tools/images land — see `03`)
}

export interface AIChatOptions {
  messages: AIMessage[];
  system?: string;
  model?: AIModel;            // defaults to claude-opus-4-8 in the adapter
  effort?: AIEffort;          // -> output_config.effort
  maxTokens?: number;         // streaming default ~64000
  /**
   * Per-workspace BYO key, or the platform key. Resolution & storage are
   * owned by `02-byo-key-storage.md`; the port just takes the resolved key.
   * Maps to `new Anthropic({ apiKey })` inside the adapter.
   */
  apiKey: string;
  /**
   * Tool surface — owned by `03-mcp-and-tools.md` (in-process tools now,
   * MCP connector fast-follow). Typed loosely here so this note doesn't
   * duplicate `03`'s schema.
   */
  tools?: unknown[];
  signal?: AbortSignal;
}

export interface AIResult {
  text: string;
  stopReason: string;
  usage: { inputTokens: number; outputTokens: number; cacheReadInputTokens: number };
}

export interface AIStreamChunk {
  type: "text" | "thinking" | "done";
  delta?: string;
}

export interface AIService {
  /** Single-shot (Server Action / short outputs). */
  chat(opts: AIChatOptions): Promise<AIResult>;

  /**
   * Streaming (Route Handler / chat UI). Adapter uses
   * client.messages.stream(...) and resolves the final Message via
   * await stream.finalMessage(). Required for large outputs (timeout safety).
   */
  streamChat(opts: AIChatOptions): AsyncIterable<AIStreamChunk>;
}
```

Consumption mirrors the other ports exactly — an `aiService()` factory + an
`AI_ENABLED` flag in `apps/web/src/lib/ai.ts`, gated by the AI feature flag (off
by default per PLAN §9):

```ts
// apps/web/src/lib/ai.ts — design sketch, not implemented
// (cf. apps/web/src/lib/realtime.ts / email.ts)
export const AI_ENABLED = /* AI feature flag, off by default */ false;

export function aiService(): AIService {
  return createAnthropicAIService(); // the only @anthropic-ai/sdk importer
}
```

**Self-host story.** Same port, both tiers. The key is supplied per request
(`new Anthropic({ apiKey })`), so cloud uses the tenant's BYO key or a platform
key, and self-host supplies the operator's/tenant's own key — no code change,
exactly like `RealtimeService` (Ably cloud / Soketi self-host). The one cloud-only
enhancement is the **MCP connector** (beta, first-party Claude API / Claude
Platform on AWS only — not Bedrock/Vertex), which is why `03` makes in-process
tools the portable baseline. If/when an `AI_ENABLED`-style env (e.g. a platform
fallback key) is added, it goes in `apps/web/src/env.ts` as an optional Zod field —
but the **per-workspace key path is `02`'s call**, not this note's.

---

## 5. Phasing

Feature-flagged off by default throughout (PLAN §9 reserves `packages/ai` "gated
by AI feature flag"). Each step names the owning agent.

| Step | Scope | Surface | Owner(s) |
|---|---|---|---|
| **0. Land the port** | `packages/ai`: `AIService` types + `anthropic-adapter` (`@anthropic-ai/sdk`); add the SDK to the ESLint `no-restricted-imports` allow-list as adapter-only; `aiService()` + `AI_ENABLED` in `apps/web/src/lib/ai.ts` | none (package) | `backend-engineer` (port), `devops-engineer` (ESLint rule + dep) |
| **1. MVP: single-turn assist behind the flag** | One non-streamed action (`chat()`): "draft acceptance criteria" / "summarize this thread" on a known input. Read-only, no tools yet. Prompt-cache the system prompt. | Server Action | `backend-engineer` + `frontend-engineer` (entry point), `product-lead` (prompt + acceptance criteria) |
| **2. Streaming chat** | `streamChat()` over a Node Route Handler returning a `ReadableStream`; small client reader (no `useChat` dep). `max_tokens` ~64000. Per-workspace rate limit. | Route Handler + client hook | `backend-engineer` (handler/stream), `frontend-engineer` (chat UI/reader), `security-engineer` (tenant scope on the route) |
| **3. Tool / MCP actions** | Wire the in-process tool surface from `03` (search + reads, then gated writes with propose→confirm→apply); BYO-key resolution + cost ceiling from `02`. MCP connector as the cloud-only fast-follow once HTTP transport + PATs exist. | Route Handler (+ Inngest for long loops) | `integrations-engineer` (tools/MCP — `03`), `security-engineer` (key storage — `02`), `backend-engineer` (loop), `devops-engineer` (Inngest + rate-limit budget) |

Dependencies: Step 3's long-loop/batch path is gated on **Inngest landing**
(Phase 2+, currently a stub) and on `02`/`03` being implemented. Steps 0–2 have no
such dependency and can ship as soon as Phase 4 opens.

---

## Recommendation

Build the assistant on the official **`@anthropic-ai/sdk` wrapped in an
`AIService` port** in `packages/ai`, consumed via an `aiService()` factory exactly
like the existing realtime/search/email ports, with the SDK confined to one
adapter file and enforced by the ESLint vendor-import rule (PLAN §7, ADR 0001).
**Do not adopt the Vercel AI SDK** — it wraps the provider and adds Vercel-aligned
lock-in to a self-host-first product, and the `useChat` DX it buys is replaceable
by a small client reader over our own stream. Run the assistant in a **Node
Route Handler** that returns a `ReadableStream` fed by
`client.messages.stream(...)`; keep per-turn work inside PLAN §4.5's 5s budget and
push long agentic loops and batch ops to **Inngest** once it's wired (Phase 2+).
Default to **Opus 4.8**, drop to Sonnet/Haiku for cheap/bulk turns, and make
**prompt caching of the frozen system-prompt + tool-list prefix** the primary cost
lever. Phase it MVP single-turn → streaming chat → tool/MCP actions, behind the AI
flag throughout.

## Open questions

- **Inngest timing** (owner: `devops-engineer`): the `JobQueue` port + Inngest are
  Phase 2 and unwired today. Step 3's batch/agentic AI can't ship until they land
  — confirm sequencing against the Phase 2 plan.
- **Platform fallback key & env** (owner: `security-engineer`, with `02`): does a
  platform-provided key exist for workspaces without a BYO key, and what's its env
  var in `apps/web/src/env.ts`? Defers to `02-byo-key-storage.md`.
- **`maxDuration` for the AI route** (owner: `devops-engineer`): import routes use
  30s; pick the right ceiling for slow streamed turns without violating the spirit
  of the 5s work budget.
- **Streaming transport choice** (owner: `frontend-engineer` + `backend-engineer`):
  raw text `ReadableStream` vs SSE for the chat endpoint — affects the client
  reader and any Ably-based progress fan-out for Inngest jobs.
- **AI feature-flag mechanism** (owner: `product-lead` + `devops-engineer`): how
  `AI_ENABLED` is toggled (env, per-workspace plan, both) — interacts with the
  free-cloud / paid-self-host model.
