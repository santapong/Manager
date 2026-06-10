# Changelog

All notable changes to this project will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · Versioning: [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
