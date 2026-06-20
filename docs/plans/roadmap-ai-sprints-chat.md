# Build plan — AI assistant · Sprints + Backlog · Team chat

Sequenced delivery plan for the three features the user asked to build, owned by the delivery team in `.claude/agents/`. Created 2026-06-20.

Status legend: ☐ not started · ◐ in progress · ☑ done. Everything ships behind a flag and through the existing RLS + vendor-port patterns.

## Sequencing at a glance

```
Wave 1  Sprints + Backlog        ─ reuses board/points/charts, no new infra ──► fastest value
Wave 2  AI assistant (ADR 0002)  ─ new: encryption-at-rest, streaming, Inngest ──► biggest differentiator
Wave 3  Team chat                ─ needs Ably realtime promoted to default-on ──► most net-new infra
```

**Why this order:** Wave 1 is the lowest-risk, highest-PM-value win — it reuses the kanban board, `points`, the dependency-free chart approach from the dashboard, and the established schema→migration→RLS pattern, adding no new infrastructure. Wave 2 introduces the project's first encryption-at-rest primitive, first streaming Route Handler, and first real Inngest use, so it wants focused review. Wave 3 needs the Ably adapter promoted from inert to default-on plus a new surface, and is the least-requested.

**Parallelization:** with the full team, **Wave 1 and Wave 2a can run as parallel squads** (disjoint areas: sprints = board/schema; AI = `packages/ai` + settings + a new table). Wave 3 is held until one of the first two lands to avoid contention on realtime/streaming attention.

Migrations are sequential and separate: **0008** sprints · **0009** AI keys · **0010** chat.

---

## Wave 1 — Sprints + Backlog (Phase 2 core) — ☑ SHIPPED

**Goal:** plan work into time-boxed sprints with a backlog, start/finish a sprint, and see burndown.

> Shipped 2026-06-20 (migration 0008). Sprints list + new-sprint dialog, sprint detail with Start/Finish/Delete + dnd board + CSS-bar burndown, and a backlog with move-to-sprint. Gate green. Follow-up: record `sprint_changed` activity on assign/move (type now exists).

- **Schema (migration 0008, database-engineer):** `sprints` (workspace_id, project_id, name, goal, start_at, end_at, status `planned|active|completed`, created_by) + `tasks.sprint_id` (nullable FK, set null on delete) + index. Workspace RLS `*_isolation` mirroring 0007. Backlog = tasks with `sprint_id IS NULL`.
- **Backend (backend-lead → backend-engineer):** queries `listSprints`, `createSprint`, `updateSprint`, `startSprint`, `finishSprint` (move incomplete tasks back to backlog or next sprint), `assignTaskToSprint`; Server Actions + Zod validators; activity entries (add sprint event types to the `activity` CHECK via the migration).
- **Frontend (frontend-lead → frontend-engineer):** `/[workspace]/sprints` (list + create), `/[workspace]/sprints/[id]` (sprint board reusing the existing dnd-kit board), a **Backlog** view with drag-into-sprint, sprint date-range picker, and a **burndown** widget reusing the dependency-free CSS-bar chart from the dashboard (no new chart dep) summing `points` remaining per day.
- **Design/spec:** product-designer (sprint board + backlog states), requirements-analyst (acceptance criteria).
- **Acceptance:** create a sprint with dates → drag backlog tasks in → start sprint → complete tasks → burndown trends down → finish sprint moves incomplete tasks to backlog. E2E (lead-tester) + go/no-go (lead-verification).

## Wave 2 — AI assistant (implements ADR 0002)

Sub-phases, all behind `AI_ENABLED`:

- **2a — Foundation — ☑ SHIPPED (2026-06-20, migration 0009):** `AIService` port + `@anthropic-ai/sdk` adapter in `packages/ai` (+ ESLint guard); `workspace_ai_keys` (RLS-isolated); AES-256-GCM encrypt/decrypt (`node:crypto`, `AI_ENCRYPTION_KEY`); write-only **Settings → AI** page (validate-on-save ping, last-4, rotate/remove, owner/admin gate) with a "Try it" single-turn assist. Gate green. (Audit-log table for set/rotate/remove still to add.)
- **2b — Streaming chat — ☑ SHIPPED (2026-06-20):** Node Route Handler streaming `client.messages.stream(...)`; `/[workspace]/assistant` chat UI; read-only tools (search/list tasks, projects, sprints), RLS-scoped, never trusting model ids.
- **2c — Write actions — ☑ SHIPPED (2026-06-20):** propose→confirm→apply for create/update/move task. The model never mutates — write tools emit proposals (NDJSON stream → Confirm/Dismiss cards); the only write path is an RLS-scoped Server Action that re-resolves by key+workspace. **Inngest deferred** (chat turns are bounded and stream within the request, so the `JobQueue` port isn't needed yet — schedule it when a genuinely long-running/agentic flow lands).
- **2d — MCP connector — ◐ DEFERRED (decision 2026-06-20):** The assistant runs on **in-process tools** (2b/2c) — the chosen path per `docs/research/ai/03-mcp-and-tools.md`. The MCP connector (beta `mcp-client-2025-11-20`) needs the Manager MCP server exposed at a **public HTTPS URL** with per-workspace PAT auth; the current `packages/mcp` server is **stdio-only**, and a connector can't be exercised against localhost/preview. Revisit only for external-agent / Claude-Desktop parity once an HTTP/SSE MCP endpoint exists; the in-process tools and the MCP server can share one Zod schema source when it does.
- **Acceptance:** set a key in Settings (stored encrypted, validated) → single-turn assist works → streaming chat → assistant creates/updates a task via a confirmed tool call, scoped to the workspace. Security sign-off (lead-audit) on the key path.

## Wave 3 — Team chat

**Goal:** workspace channels + DMs, distinct from task comments.

- **Schema (migration 0010, database-engineer):** `chat_channels` (workspace_id, name/kind), `chat_messages` (channel_id, author_id, body, created_at), membership for DMs; RLS.
- **Realtime (recruit realtime-engineer / devops):** promote the **Ably adapter** from inert to default-on (set `ABLY_API_KEY`); presence + live message fanout via the existing `RealtimeService` port.
- **Frontend:** chat surface (channel list + thread + composer), unread indicators.
- **Gating:** `CHAT_ENABLED` + requires `ABLY_API_KEY`; falls back to refresh-on-send when unset.
- **Acceptance:** two members exchange messages in a channel in real time; presence shows who's online. E2E + go/no-go.

---

## Cross-cutting

- **Shared infra:** Inngest (`JobQueue` port) lands in Wave 2c and is then reused for sprint digests/due-date reminders and chat notifications.
- **Charts:** reuse the dashboard's dependency-free CSS-bar approach for burndown before considering a chart library (tech-lead decision; keeps the bundle budget).
- **Gates every wave:** `pnpm typecheck && lint && test && build` green, Playwright path, and `lead-verification` go/no-go before a wave is called done.
- **Each wave = its own PR** off this branch (or `main`) for reviewable scope; this plan is the index.

## Open questions
- Run Wave 1 and Wave 2a in parallel (two squads) or strictly sequential? (Default: parallel — disjoint files.)
- Sprint cadence presets (1/2-week templates) — fold into Wave 1 or defer? (Ties to the "PM plan presets" ask.)
- Chat scope: channels + DMs, or channels only for v1?
