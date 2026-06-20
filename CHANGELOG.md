# Changelog

All notable changes to this project will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · Versioning: [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Team chat (Wave 3, migration `0010`)

- `/[workspace]/chat` — workspace **channels** (RLS-isolated, unique name per workspace) with a message room: optimistic send, author avatars, auto-scroll, `aria-live`. Distinct from task comments.
- Realtime via the existing `RealtimeService` port — posts publish to `ws:{wsId}:chat:{channelId}` and the room subscribes through `/api/realtime/token`; **graceful fallback** to refresh-on-send when `ABLY_API_KEY` is unset. Chat added to the nav + Cmd-K palette. Follow-ups: DMs, unread counts, edit/delete.

### AI assistant — streaming chat + actions (Wave 2b/2c)

- **Streaming chat** at `/[workspace]/assistant`: a Node Route Handler streams `messages.stream(...)` token-by-token; the assistant answers from **real workspace data** via read-only, RLS-scoped tools (`search_tasks`, `list_projects`, `list_tasks`, `get_project`, `list_sprints`) run server-side in a capped tool loop. The Anthropic SDK stays confined to the `@manager/ai` adapter; tool execution + tenant scoping live in the web app.
- **Write actions via propose → confirm → apply**: the model never mutates. Write tools (`create_task`/`update_task`/`move_task`) emit *proposals* (streamed as NDJSON) that render as Confirm/Dismiss cards; the only write path is a user-confirmed, RLS-scoped Server Action that re-resolves the task/project by key+workspace (never trusting model-supplied ids).
- **MCP connector deferred** (decision recorded in PLAN.md): the in-process tools are the chosen, portable path; the beta connector needs a public HTTPS MCP endpoint the stdio server doesn't expose. Inngest also deferred (chat turns are bounded). Realtime fanout on assistant-applied changes and task-drawer assist wiring are noted follow-ups.

### Sprints + Backlog (Wave 1) and AI assistant foundation (Wave 2a)

Two workstreams built in parallel on a shared data layer (migrations `0008_sprints`, `0009_ai_keys`). Full gate green: typecheck (16 packages), ESLint, unit suites, and the production build; DB-backed suites skip without a Postgres, as before.

#### Sprints + Backlog (migration `0008`)
- `sprints` table (planned/active/completed, project-scoped) + `tasks.sprint_id` (backlog = `sprint_id IS NULL`); `activity` CHECK + type union gain `sprint_changed`.
- `/[workspace]/sprints` list + new-sprint dialog; `/[workspace]/sprints/[sprintId]` detail with Start/Finish/Delete, a dnd-kit status board (reuses `moveTask`), and a **dependency-free CSS-bar burndown** (remaining points + ideal line; `points` × `updatedAt` completion proxy). `finishSprint` sweeps non-done tasks back to the backlog in one transaction; sprint delete returns tasks to backlog via the `set null` FK.
- `/[workspace]/sprints/backlog` with project filter and optimistic move-to-sprint. Sprints added to the workspace nav + Cmd-K palette.

#### AI assistant foundation (migration `0009`, ADR 0002)
- New **`AIService` port** (`@manager/ai`): vendor-neutral `complete` + `validateKey`, default model `claude-opus-4-8`, Anthropic adapter using adaptive thinking + effort. The SDK is confined to the adapter file and ESLint-guarded (`no-restricted-imports`), matching the realtime/email/search ports.
- **BYO per-workspace API key, encrypted at rest**: `workspace_ai_keys` table; AES-256-GCM via `node:crypto` (`version‖iv‖tag‖ciphertext`, master key from `AI_ENCRYPTION_KEY`); plaintext never logged or returned (only `last4` leaves the server); decrypt only at call time.
- **Settings → AI** page: write-only key entry validated against Anthropic before save, rotate/remove, owner/admin-gated, with a "Try it" single-turn assist (summarize / draft acceptance criteria). Added to the Cmd-K palette.
- Deliberate follow-ups (later waves per ADR 0002): task-drawer assist wiring, streaming chat, in-process tools + MCP connector, Inngest.

### Dashboard, Pomodoro, Docs, and GitHub integration

Four user-facing features on a shared data layer (migration `0007_dashboard_docs_github`: `dashboard_layouts`, `pomodoro_sessions`, `documents`, `github_connections`, `github_links` — all with workspace RLS). Repo-wide typecheck (16 packages), ESLint, unit suites, and the production build are green; DB-backed suites skip without a Postgres, as before.

#### Draggable dashboard (`/[workspace]/dashboard`)
- Per-user widget grid, rearranged by drag (dnd-kit `rectSortingStrategy`, dedicated drag handle so clicking inside a widget never starts a drag); order/visibility persisted to `dashboard_layouts` (upsert on workspace+user). Add-widget menu + per-card remove, both persisted immediately.
- Widgets: tasks done (+ last-7-days), by status, by priority, overdue, my open tasks, completions chart (14-day, dependency-free CSS bars), and the Pomodoro timer. Stats are one grouped `count(*) filter(...)` pass + one histogram across all projects; `updatedAt` is the completion proxy (no `completedAt` column yet).

#### Pomodoro
- 25/5/15 focus/short/long timer (long break after 4 focus sessions). Countdown derived from a target timestamp so it stays accurate across re-renders and backgrounding; running state mirrored to `localStorage` (keyed by workspace). A completed focus interval inserts a `pomodoro_sessions` row (powers the dashboard "focus today" count), with a guarded WebAudio beep + Notification.

#### Documents / wiki (`/[workspace]/docs`)
- List + create + two-pane Markdown editor (textarea + live preview), dirty-tracking, delete-with-confirm. `createdBy`/`updatedBy` stamped from the session user.
- `src/lib/markdown.tsx` — dependency-free, XSS-safe renderer: never uses `dangerouslySetInnerHTML` (all user text is React-escaped); the only user-derived attribute is link `href`, allow-listed to `http`/`https`/`mailto` with control-char/whitespace rejection to defeat scheme smuggling (`java\tscript:` etc.); external links get `rel="noopener noreferrer" target="_blank"`. Single-writer base; real-time co-editing (Yjs) deferred per PLAN §2.

#### GitHub integration (`/[workspace]/settings/github`, `POST /api/webhooks/github`)
- Connect a repo (owner/name or URL); a per-connection secret + payload URL are shown with copy buttons and setup instructions.
- Inbound webhook (Node runtime) verifies `x-hub-signature-256` over the **raw** request body with the per-connection secret using a length-guarded `timingSafeEqual`; resolves connections by repo (owner-role lookup, RLS-bypassing like invite/session reads) and only acts on connections whose secret verifies — fails closed with 401, 202 for unconnected repos, ack on `ping`/unhandled events.
- `pull_request` events link PRs to tasks by task key (`ABC-123` extracted from title/branch/body), upsert `github_links` (idempotent on re-delivery), and drive task status (opened/reopened/ready/synchronize → in_progress; merged → done). Pure helpers (`extractKeys`, `verifySignature`, `parsePullRequestEvent`, `mapPrToStatus`) live in `@manager/integrations`. No outbound GitHub API or stored access token yet (deliberate — keeps the flow inbound-only).
- Wires Dashboard/Docs/GitHub into the workspace nav and the Cmd-K palette.

### Phase 1 complete — PRs 3–11 (collaboration, board, search, palette, realtime)

All remaining Phase 1 PRs shipped as a stacked wave on the kickoff branch. Every feature verified end-to-end with Playwright against a local Postgres 16 (7 specs green) plus 30 Vitest cases against the real schema.

#### Collaboration schema (PR 3, migration `0004_collaboration`)
- `comments` (mentions `uuid[]`), `activity` (append-only typed events with `{from,to}` payloads), `notifications` (recipient rows, `read_at`, partial unread index) — all with workspace RLS policies
- `createComment()` parses `@[Name](uuid)` tokens, resolves them to members, inserts the comment + mention notifications + `comment_added` activity in one transaction

#### Kanban board (PR 4, migration `0005_position_double`)
- `tasks.position` → double precision; `moveTask()` computes fractional positions server-side from neighbor ids, with in-transaction column rebalance when gaps exhaust
- dnd-kit board at `/projects/[key]/board` — column-per-status, live cross-column drag preview, DragOverlay, keyboard sensor; card click opens the task drawer; shared `ProjectTabs` nav across project pages

#### Comments + mentions UI (PR 5) and inbox (PR 6)
- Drawer comments thread + composer with @mention autocomplete; mention chips in rendered bodies; author-or-admin delete; best-effort mention emails post-commit
- Assignee changes notify the new assignee in the same transaction
- `/inbox` with unread/all filter, mark-read-on-open, mark-all; unread badge in the header; rows deep-link via `?task=` which auto-opens the drawer

#### Activity feed (PR 7)
- Diff-based `recordActivity()` on every field patch, task creation, board moves, and the `/api/v1` status route (null actor = API/MCP); compact feed in the drawer

#### Search (PR 8, migration `0006_search_tsv`) + palette (PR 9) + filters (PR 10)
- Generated `search_tsv` tsvector + GIN on tasks — `english` config for title/description (query stemming matches; a `simple`-indexed title made title-only words unfindable — caught by E2E), `simple` for keys with an ILIKE prefix arm for exact-key jumps
- Real `search()` in `@manager/search` (workspace-scoped, ranked); `/[workspace]/search` page grouped by project
- Cmd-K palette (`cmdk`): navigation + debounced FTS task search, mounted in the workspace layout
- List filter/sort bar persisted in URL params — the exact shape Phase 2 saved views will store

#### Realtime (PR 11 — code-complete, off by default)
- Ably adapter behind the existing `RealtimeService` port (REST publish + subscribe-only token minting); `/api/realtime/token` 404s without `ABLY_API_KEY`; board subscribes through a lazily-imported browser helper and falls back silently to revalidate-on-action; board moves and comments publish best-effort

#### CI + test harness
- `ci.yml`: build step gets placeholder env (the Zod gate failed every CI build); `pnpm test` added as a gate
- DB test files run sequentially against shared databases; the pre-existing blanket `DELETE FROM workspaces` cleanup is scoped; RLS isolation assertions across all suites now probe whether the connection role is policy-bound and skip honestly on owner/bypass connections

### Phase 1 kickoff — roadmap refresh + task fields + member invites

Phase 1 PR sequence revised before kickoff (PLAN.md §9 + §6, 2026-06-09): quick wins first, sprints item corrected back to Phase 2, Ably moved to stretch, Inngest deferred to Phase 2. First two PRs of the new sequence ship together here.

#### Task fields quick win (Phase 1 PR 1)
- Task drawer gains Assignee / Due date / Type / Points editors; list rows show type badge, due-date chip (red when overdue), assignee initials
- `listMembers()` query (`packages/db/src/queries/members.ts`) — memberships ⋈ users, reused by the assignee picker and later by mentions
- `updateTask()` accepts `type`; `UpdateTaskSchema` extended (`type`, `assigneeId`, `dueAt` as `YYYY-MM-DD`→`Date`, `points` 0–100)
- Vitest: `packages/db/test/task-fields.test.ts`; smoke E2E extended to set fields via the drawer

#### Member invites (Phase 1 PR 2)
- `invites` table + migration `0003_invites` — hashed single-use tokens (magic-link scheme), 7-day TTL, one pending invite per email per workspace (partial unique index), RLS isolation policy
- `/{workspace}/settings/members` — members list, invite form (email + role), pending invites with revoke, copy-invite-link
- `/invite/[token]` accept flow — validates expiry/single-use/email match, creates membership with invited role, activates the workspace; invalid states render friendly errors
- Invite email template in `@manager/email` (`templates/invite.ts`); shared `emailService()` helper extracted to `apps/web/src/lib/email.ts` (auth now uses it too)
- Sign-in honors `?next=` (relative paths only) so invite links survive the auth bounce; workspace header gains Projects / Tags / Members nav
- Vitest: `packages/db/test/invites.test.ts` (lifecycle, single-use, expiry, RLS isolation); Playwright `e2e/invites.spec.ts` (two-context invite → accept → member visible)

#### Fixed (found by actually running the E2E suite end-to-end against local Postgres)
- **Sessions never persisted in dev**: the `__Host-session` cookie was set without `Secure` outside production — browsers reject `__Host-` cookies lacking it. `Secure` now stays on in every env (localhost is a trustworthy origin, so http://localhost still works)
- **Cross-tenant project reads**: the four app-page project lookups filtered by `key` alone, relying on RLS — which the table-owner connection (Neon default) bypasses. All now filter `workspace_id` explicitly (`projects/[projectKey]` page + actions, `milestones`, `graph`)
- `middleware.ts` blocked `/api/dev/login`, so the Playwright `devLogin` helper followed the 307 to the sign-in page and "passed" with no cookie — the E2E suite could never have run; `/api/dev` added to public paths (route stays 404-gated by `DEV_LOGIN_TOKEN` + non-prod)
- Workspace home "New project" used a relative `href="./projects/new"` that resolved to a 404; project rows are now links too
- `createProject`'s success `redirect()` was swallowed by its own `try/catch` (`NEXT_REDIRECT` throws), landing users back on the workspace home
- `turbo.json` now declares `env` keys for `build`/`test` — Turborepo strict mode was stripping `DATABASE_URL`/`AUTH_SECRET` before they reached `next build`
- ESLint: generated `next-env.d.ts` ignored; unused var in `packages/db/test/rls.test.ts` renamed — `pnpm lint` is green again
- E2E `devLogin` helper now stores the session cookie host-only via the `https://` url form (required for the `__Host-` prefix)

### Phase 0 — Scaffolding (complete)

Phase 0 closed across 10 stacked PRs (#2–#11). Acceptance: a deployed Next.js 15 app on Vercel where a signed-in user can create a workspace, a project, and CRUD tasks; RLS enforces tenant isolation; Sentry captures errors; Playwright E2E covers the happy path and the isolation invariant.

#### PR #2 — Turborepo scaffold + CI baseline
- pnpm workspaces + Turborepo + TypeScript 5.6 strict
- `apps/web` (Next.js 15 + React 19 + Tailwind 3) with a placeholder page importing `Badge` from `@manager/ui`
- Stub packages `@manager/{config,db,auth,jobs,ui,realtime,email,storage,search}`
- Shared `@manager/config` (tsconfig, eslint, prettier, tailwind preset)
- ESLint `no-restricted-imports` rule blocks direct `@vercel/blob`, `ably`, `pusher`, `resend` imports outside adapters (PLAN.md §7)
- `.github/workflows/ci.yml`: install (frozen) · typecheck · lint · build

#### PR #3 — Vercel + Zod-validated env
- `apps/web/src/env.ts` (Zod parser, fails build on missing required vars)
- `apps/web/.env.example` (every key documented + grouped)
- `vercel.json` with `iad1` region + security headers (HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy)

#### PR #4 — DB + Drizzle + Postgres RLS
- Schema: `users`, `workspaces`, `memberships`, `projects`, `lists`, `tasks`, `sessions`, `verification_tokens`, `oauth_accounts`
- `migrations/0000_init.sql` (generated) + `0001_rls.sql` (hand-written) with USING + WITH CHECK policies
- `withWorkspace(db, workspaceId, fn)` — the sanctioned tenant-scoped query helper
- Two clients: `dbNode` (postgres-js, transactions) and `dbEdge` (Neon HTTP)
- Per-project `PROJ-N` task key generator with advisory lock
- Vitest RLS isolation suite (auto-skips when `DATABASE_URL` is unset)

#### PR #5 — Auth: magic-link + GitHub OAuth behind `AuthService` port
- `@manager/auth`: `AuthService` port + implementation backed by Drizzle tables
- Magic-link tokens (SHA-256-hashed at rest, single-use, 10-min TTL)
- GitHub OAuth with `__Host-oauth-state` CSRF cookie
- 30-day sessions on `__Host-session` (HttpOnly, SameSite=lax, Secure in prod)
- `@manager/email`: `EmailService` port + Resend adapter + console fallback
- `app/(auth)/sign-in/` + three route handlers (`callback/magic-link`, `callback/github`, `sign-out`)

#### PR #6 — Workspaces + memberships + onboarding
- `/welcome` creates workspace + first membership (role=owner) in one transaction
- `[workspace]` layout enforces membership and returns 404 (not 403) for non-members — existence-hiding
- `src/lib/workspace-context.ts` exposes `getActiveWorkspace()` and `withActiveWorkspace(fn)`
- `middleware.ts` gates everything except `/sign-in`, `/api/auth`, `/api/health`, static

#### PR #7 — Project + task CRUD with optimistic UI
- New-project page with auto-uppercased key field
- Task list view, single-input add form, status cycle (open → in_progress → done) via `useOptimistic`
- Delete with `confirm()`; Server Actions revalidate the path after each mutation
- Shared Zod validators in `src/lib/validators/task.ts`

#### PR #8 — Health endpoints + Sentry + structured JSON logger
- `GET /api/health` (edge) — db check + commit SHA, 503 on degraded
- `GET /api/health/deep` (Node, bearer-gated) — db read + temp-table write timing
- Sentry: three runtime configs (client/server/edge) + `instrumentation.ts`, 10% trace sample, PII off
- `@manager/observability`: vendor-neutral JSON logger with child contexts and level filtering
- `pnpm.overrides` pins `drizzle-orm` so Sentry's OpenTelemetry peer doesn't duplicate the package

#### PR #9 — Playwright E2E + RLS isolation tests
- `apps/web/e2e/smoke.spec.ts` — sign-in → workspace → project ENG → task ENG-1
- `apps/web/e2e/rls.spec.ts` — two users in two workspaces; cross-workspace GET returns 404
- `/api/dev/login` — bearer-gated test shortcut, returns 404 unless `DEV_LOGIN_TOKEN` + non-prod
- `.github/workflows/e2e.yml` runs Playwright on non-draft PRs (needs `DATABASE_URL_E2E`, `AUTH_SECRET_E2E`, `DEV_LOGIN_TOKEN_E2E`)

#### PR #10 — Vendor-port stubs + ADR
- `@manager/realtime`: `RealtimeService` types + logging no-op adapter
- `@manager/storage`: `BlobService` types + throwing no-op adapter (loud failure beats silent data loss)
- `@manager/search`: `SearchService` types + Postgres-FTS adapter stub
- `docs/adr/0001-vendor-ports.md` records the five ports, their cloud + self-host impls, and what we deliberately don't abstract

#### PR #11 — PLAN.md + registry sync + Phase 1–4 skeletons
- Decision log entries for every choice that arose during Phase 0 (typedRoutes off, drizzle override, Tailwind 3, dev login shortcut, Phase 0 PR sequencing)
- New PLAN.md §8 (Phase 0 — what shipped) and §9 (Phase 1+ skeleton — landing zones)
- `.claude/agents/registry.md` updated; new agent definition files for database / security / backend / frontend / qa engineers
- Landing-zone folders + `.gitkeep`s seeded for Phase 1–4 (`board/`, `inbox/`, `search/`, `sprints/`, `roadmap/`, `reports/`, `docs/`, `webhooks/`, `realtime/`)
- New package skeletons `@manager/{integrations,charts,docs,ai}` so Phase 1+ specialists have a home before their first PR

### Decided (locked in PR #1, expanded throughout Phase 0)

See `PLAN.md` §6 for the complete decision log.

### Coming next — Phase 1 (MVP), PRs 3–11

Collaboration schema (comments / activity / notifications), kanban board with drag/drop, comments + @mentions, notifications inbox, activity feed, Postgres FTS via generated tsvector, Cmd-K command palette, list sort/filter; Ably adapter as the end-of-phase stretch. See `PLAN.md` §9 for the revised sequence and `docs/phase-1/README.md` for the landing zones.

### Phases 2–4

- **Phase 2** — sprints, issue types, estimates, GitHub PR linking, webhooks
- **Phase 3** — Gantt + dependencies, custom fields, reports (cycle time, throughput, velocity), time tracking
- **Phase 4** — docs/wiki with real-time co-editing (Yjs), presence, optional AI assist (Anthropic)

[Unreleased]: https://github.com/santapong/Manager/commits/main
