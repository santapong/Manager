# 03 — MCP & Tools for the AI Assistant

Research note. Scope: how the Phase 4 in-app AI assistant should call Manager
actions ("tool use"), and how that relates to the MCP server Manager already
ships. **No app code or deps in this note** — recommendation only.

Sibling notes: `01-framework-and-vercel.md` (assistant runtime/streaming),
`02-byo-key-storage.md` (where the Anthropic key lives). This note assumes the
assistant runs server-side in the Next.js app and that a workspace-scoped
Anthropic key is already resolved by the time a tool runs.

TL;DR: **Yes, we already have MCP, and yes we can extend it.** For the MVP,
drive the assistant with **in-process custom tools** that call the same server
functions the REST/MCP layer uses. Add the **MCP connector** as a fast-follow so
the in-app assistant and external agents (Claude Desktop) share one tool surface.

---

## 1. Current MCP status — do we already have MCP? (yes)

Manager ships a working MCP server in `packages/mcp/`. Inventory:

- **Transport:** stdio only today. The server build (`src/server.ts`) is
  transport-agnostic (`createServer()` returns the SDK `Server`; `cli.ts` wires
  `StdioServerTransport`). An HTTP/streamable transport is an explicit follow-up
  (noted in `cli.ts` and `server.ts`).
- **Packaging:** a `.mcpb` bundle for one-click Claude Desktop install.
  `packages/mcp/manifest.json` declares the node entry point, the tool list, and
  three `user_config` fields (`base_url`, `api_key`, `workspace_slug`). Built
  artifact lives under `packages/mcp/dist/`.
- **Auth/scoping (today):** the MCP server is a **thin HTTP client** to the
  public REST API. `src/client.ts` sends `Authorization: Bearer <MANAGER_API_KEY>`
  + `X-Workspace-Slug: <slug>` on every call. `src/config.ts` requires both env
  vars at startup. This is a **single static instance-wide API key + one
  workspace slug per install** — not per-user. PATs (argon2id-hashed, per-user,
  per-scope) are the documented follow-up (see `client.ts` header and
  `apps/web/src/lib/api-auth.ts`).
- **Tools (9), schemas as Zod, converted to JSON Schema at registration:**
  - Read: `list_projects`, `get_project`, `list_tasks`, `get_task`,
    `list_milestones`, `get_milestone_progress`.
  - Write: `create_task`, `update_task_status`, `import_plan` (defaults to
    `dryRun: true` — preview before commit).
  - Each tool module (`src/tools/*.ts`) is `{ name, description, inputSchema,
    handler }`; the handler calls one or two `/api/v1/*` endpoints. The server
    validates input with Zod before dispatch and returns structured JSON errors.

**Can we extend it? Yes.** Adding a tool is a new module in `src/tools/` plus a
line in `src/tools/index.ts` and `manifest.json`. The registry already drives
both the live server and the .mcpb manifest, matching the standard in
`.claude/agents/integrations-engineer.md` ("MCP tool schemas live in a shared
`packages/mcp/` package").

**Key consequence for the assistant.** The REST surface under
`apps/web/app/api/v1/*` IS the tool contract. Every v1 route runs inside
`withApiAuthResponse` → `withWorkspace(workspaceId, …)`, so RLS is enforced
server-side regardless of caller. Whatever path we pick for the assistant should
reuse this surface (or the server functions underneath it), not re-implement it.

---

## 2. Two integration paths for the assistant

### (a) MCP connector — assistant → Anthropic API → Manager MCP server → `/api/v1`

The Messages API can call a remote MCP server's tools directly (beta header
`mcp-client-2025-11-20`). Request shape requires **both halves, names matching**,
or it 400s:

```jsonc
// beta header: anthropic-beta: mcp-client-2025-11-20
{
  "model": "claude-opus-4-8",
  "mcp_servers": [
    { "type": "url", "url": "https://<host>/mcp", "name": "manager",
      "authorization_token": "<workspace-scoped token>" }
  ],
  "tools": [ { "type": "mcp_toolset", "mcp_server_name": "manager" } ]
}
```

The assistant would drive a workspace by calling Manager's **own** MCP tools over
HTTPS — the exact tools Claude Desktop sees.

- **Pros:** reuses the exact tool contracts already shipped; identical surface to
  Claude Desktop / Claude Code; cleanly decoupled (Anthropic ↔ MCP server is a
  documented protocol, not bespoke glue); new tools appear everywhere at once.
- **Cons:**
  - Requires the **HTTP/streamable transport** that isn't built yet (today stdio
    only), reachable over **public HTTPS**.
  - Extra **network hop**: assistant → Anthropic → our MCP endpoint → our REST →
    our DB. Higher latency, more failure surface.
  - **Beta**, and **first-party Claude API + Claude Platform on AWS only — not
    on Bedrock / Vertex** (matters for self-host; see §5).
  - Needs a **workspace-scoped bearer token** for `authorization_token` that
    isn't the instance-wide static key — i.e. PATs must land first.

### (b) In-process custom tools — handled inside the Next.js server

Define tools with the official SDK tool runner (`betaZodTool` +
`client.beta.messages.toolRunner`) or a manual tool loop. Each handler calls the
**same internal server functions** the REST/MCP layer uses — e.g. the helpers in
`apps/web/src/server/*` and `@manager/db/queries` (`createTask`,
`recordActivity`), wrapped in `withActiveWorkspace(...)`. No network hop.

- **Pros:** lowest latency (in-process function call, no HTTPS round-trip to our
  own API); **works everywhere** (cloud + self-host, no beta, any model
  provider); trivially binds to the current session's workspace via
  `withActiveWorkspace` (§4); easiest to gate behind the Phase 4 AI feature flag
  in `packages/ai/`.
- **Cons:** a **second tool definition to maintain** alongside the MCP tools (two
  schemas can drift). Mitigation: keep tool input schemas in the shared
  `packages/mcp/` Zod modules and import them into the assistant's tool runner so
  there's **one schema, two bindings** (one HTTP handler for MCP, one in-process
  handler for the assistant).

### Recommendation: start with (b), fast-follow with (a)

**Build the MVP on in-process custom tools.** It is the simplest, most portable
option, needs no beta, no public MCP endpoint, and no PAT work, and it binds
naturally to the signed-in user's active workspace. It also lands cleanly inside
the gated `packages/ai/` package the plan already reserves.

**Then add the MCP connector as a fast-follow.** Once the HTTP transport + PATs
exist (both already on the roadmap), wiring the connector lets external agents
**and** the in-app assistant share one tool surface. Make this cheap by sharing
the Zod schemas from `packages/mcp/` from day one so the two bindings can't drift.

---

## 3. Tool surface for the assistant

Map the assistant's Phase 4 jobs ("task breakdown, summarize thread, draft
acceptance criteria") onto a small, mostly-read surface first.

**Expose first (read):**
- `search` — workspace-scoped task/doc search. A `SearchService` port already
  exists (`packages/search/`, `apps/web/src/lib/search.ts`); the assistant needs
  it to find context without the user pasting IDs.
- `list_projects`, `get_project`, `list_tasks`, `get_task`, `list_milestones`,
  `get_milestone_progress` — reuse the existing six read tools verbatim.
- `summarize_project` / `summarize_sprint` — thin reads over existing rollups
  (`get_milestone_progress`, `getWorkspaceStats` in
  `apps/web/src/server/dashboard.ts`); the model writes the prose, the tool just
  returns structured numbers + the task list.

**Expose next (write, gated):**
- `create_task` (incl. the "task breakdown" use case — N subtasks),
  `update_task_status` (move on the board), `import_plan` (already dry-run by
  default — keep that default for the assistant).

**Read/write split & safety model for write tools:**
- **Read-first.** Ship the assistant read-only, add writes once trust + UX
  (confirmation surface) exist.
- **Confirmation / gating for mutations.** Writes should be a **propose →
  confirm → apply** flow: the tool returns a structured *preview* (the diff /
  the task it would create) and the actual mutation only runs after explicit user
  confirmation in the UI. `import_plan`'s `dryRun: true` default is the template.
  Destructive/bulk actions (bulk status moves, anything delete-shaped) require
  confirmation, never auto-apply.
- **Never trust model-supplied IDs.** Resolve everything against the scoped DB,
  exactly as the v1 routes already do — they look up the project by
  `(workspaceId, key)` and the task by `(projectId, taskKey)` and 404 on a miss
  (`apps/web/app/api/v1/tasks/route.ts`,
  `apps/web/app/api/v1/tasks/[taskKey]/status/route.ts`). A model that invents
  `PROJ-9999` gets a 404, not a cross-tenant write.
- **Enforce the workspace boundary on EVERY tool call**, regardless of what the
  model asks. In-process tools run inside `withActiveWorkspace`; MCP-connector
  tools run inside `withApiAuthResponse` → `withWorkspace`. The workspace is
  taken from the request context, **never** from a tool argument — there is no
  `workspaceId` input on any tool.
- **Idempotency for writes.** Per `.claude/agents/integrations-engineer.md`,
  tools must be idempotent where the action is — thread a client-supplied
  `Idempotency-Key` through write tools so a retried tool call doesn't double a
  task. (Plan §4.5 already mandates idempotency keys in Redis for mutations.)
- **Audit.** Mutations record activity with `actorId: null` today (API/MCP
  writes). Consider an `ai` actor distinction so the feed shows assistant-made
  changes (open question).

---

## 4. Auth & scoping

How a tool call is bound to the current workspace + user so the assistant can't
act cross-tenant:

- **In-process tools (path b).** The assistant request already carries the user's
  session and the `mgr_ws` active-workspace cookie. Tool handlers call
  `withActiveWorkspace(fn)` (`apps/web/src/lib/workspace-context.ts`), which
  resolves the workspace **from the user's memberships** and runs the body inside
  `withWorkspace(ws.id, …)` so Postgres RLS is set. The model cannot widen scope:
  it has no workspace argument, and the workspace is derived from session +
  cookie, not from tool input. This composes directly with role checks
  (`owner/admin/member/guest`) for gating writes.
- **MCP connector (path a).** Scope rides on `authorization_token` →
  `Authorization: Bearer` + `X-Workspace-Slug` → `authenticateApiRequest` →
  `withWorkspace`. This needs **per-user, workspace-scoped PATs** (the documented
  follow-up), **not** the current instance-wide static `MANAGER_API_KEY`. A PAT
  must be scoped to a workspace the user belongs to so the connector can't reach
  another tenant.
- **Composition with BYO key (sibling `02-`).** The Anthropic API key
  (per-workspace, BYO) authorizes the **model call**; the tool auth above
  authorizes the **data access**. They are independent: the BYO key never grants
  data scope, and the workspace token never authorizes model usage. With the MCP
  connector, the BYO key is the Messages API key and the workspace PAT is
  `authorization_token` — two separate secrets.
- **Per-workspace rate limits.** Plan §4.5 mandates per-workspace sliding-window
  limits in Redis. Apply them at the tool layer keyed by workspace, so an
  assistant in a chatty loop can't exhaust a tenant's budget; this also caps
  fan-out from a single model turn issuing many tool calls. Surface limit hits
  back to the model as a structured error so it can stop, not retry blindly.

---

## 5. Self-host note

The MCP connector is **beta and first-party Claude API / Claude Platform on AWS
only — not available on Amazon Bedrock or Google Vertex.** Self-host deployments
that route the model through Bedrock/Vertex (or that don't want to expose a public
MCP HTTPS endpoint) therefore **cannot use path (a)**. This is the decisive reason
to make **in-process custom tools (path b) the baseline**: they work identically
on cloud and self-host, with any model provider, no beta header, and no public
MCP endpoint. The MCP connector becomes a **cloud-only enhancement** layered on
top when available — consistent with the plan's "self-host is the paid tier,
abstract the non-portable bits" stance (§7). Keep one Zod tool-schema source so
both paths stay in lockstep.

---

## Recommendation

1. **MVP: in-process custom tools** in `packages/ai/`, behind the AI feature
   flag. Tools call existing `apps/web/src/server/*` / `@manager/db/queries`
   functions inside `withActiveWorkspace`. Start **read-only** (`search` + the six
   existing read tools + `summarize_*`), then add gated writes (`create_task`,
   `update_task_status`, `import_plan` with `dryRun` preview).
2. **Single schema source:** define tool input schemas once in `packages/mcp/`
   Zod modules; import them for the in-process tool runner. One schema, two
   bindings (in-process handler + MCP HTTP handler).
3. **Fast-follow: MCP connector** once the HTTP transport + per-user
   workspace-scoped PATs land. Then the in-app assistant and Claude Desktop share
   the exact same tool surface.
4. **Non-negotiables on writes:** propose→confirm→apply, never trust
   model-supplied IDs (resolve against the scoped DB), enforce
   `withActiveWorkspace`/RLS on every call, thread `Idempotency-Key`, apply
   per-workspace rate limits.

## Open questions

- **PAT scope model** (owner: `security-engineer`): exact scopes — per-workspace
  vs per-project, read vs write, expiry/rotation. Blocks the MCP-connector
  fast-follow and is on the continuous-delivery backlog (PLAN §2).
- **HTTP/streamable transport for `packages/mcp/`** (owner: this role): when, and
  where it's hosted (same Next.js app route vs separate `apps/mcp/` deploy) — and
  whether Vercel function timeouts suit long MCP sessions.
- **Confirmation UX** (owner: `frontend-engineer`): where preview/confirm renders
  for assistant-proposed writes (inline card, diff modal). Determines how rich the
  tool *preview* payloads must be.
- **AI actor in the activity feed** (owner: `database-engineer`): introduce an
  `ai`/assistant actor vs the current `actorId: null` for API/MCP writes, so
  assistant-made changes are attributable.
- **Rate-limit budget** (owner: `devops-engineer` + this role): per-workspace
  limit specifically for AI-driven tool calls (separate from the human REST
  budget), and how a limit hit is surfaced to the model so it stops.
- **Tool-call fan-out / cost ceiling** (owner: `02-byo-key-storage.md`): cap
  tool-loop iterations and token spend per assistant turn so a runaway loop can't
  burn a tenant's BYO-key budget.
