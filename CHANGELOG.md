# Changelog

All notable changes to this project will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · Versioning: [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

### Coming next — Phase 1 (MVP)

Kanban board with drag/drop, comments + @mentions, in-app + email notifications, basic search, command palette. Real Ably adapter wired to the `RealtimeService` port. Postgres FTS trigger-driven indexer. See `PLAN.md` §9 for the planned PR sequence and `docs/phase-1/README.md` for the landing zones.

### Phases 2–4

- **Phase 2** — sprints, issue types, estimates, GitHub PR linking, webhooks
- **Phase 3** — Gantt + dependencies, custom fields, reports (cycle time, throughput, velocity), time tracking
- **Phase 4** — docs/wiki with real-time co-editing (Yjs), presence, optional AI assist (Anthropic)

[Unreleased]: https://github.com/santapong/Manager/commits/main
