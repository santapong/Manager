# Manager

A developer-focused project management platform (ClickUp / Jira / Linear-class). Built on Vercel; designed to swap to self-host (the paid tier).

**Status:** Phase 0 — scaffolding complete. Acceptance met: sign in, create a workspace, CRUD tasks, with RLS-enforced tenant isolation and Sentry capturing errors.

See [`PLAN.md`](./PLAN.md) for the full roadmap and [`CHANGELOG.md`](./CHANGELOG.md) for what's landed.

## Stack at a glance

- **App**: Next.js 15 (App Router, React 19) + Tailwind 3, in `apps/web`
- **Monorepo**: pnpm workspaces + Turborepo
- **DB**: Postgres on Neon + Drizzle ORM, multi-tenant via Postgres RLS
- **Auth**: magic-link (Resend) + GitHub OAuth, sessions on `__Host-session` cookie
- **Realtime / files / search / email / auth**: behind internal ports — vendor SDKs only inside their adapter files (see [PLAN.md §7](./PLAN.md#7-vendor-ports))
- **Observability**: Sentry (3 runtimes) + structured JSON logger
- **Hosting**: Vercel cloud · paid self-host tier on the same code with adapter swaps

## Local development

Prerequisites: Node 20+, pnpm 10+.

```sh
pnpm install
pnpm dev          # apps/web on http://localhost:3000
pnpm typecheck    # tsc --noEmit across workspaces
pnpm lint         # ESLint flat config, enforces no-restricted-imports for vendor SDKs
pnpm build        # production build
pnpm test         # Vitest across packages
pnpm --filter @manager/web test:e2e   # Playwright (needs DEV_LOGIN_TOKEN)
```

Required env vars for a working local app: `DATABASE_URL` (Neon connection string), `AUTH_SECRET` (32+ chars). Everything else is optional with safe defaults — see `apps/web/.env.example`.

## Repo layout

```
manager/
├─ apps/
│  └─ web/                 # Next.js app
├─ packages/
│  ├─ config/              # shared tsconfig, eslint, prettier, tailwind preset
│  ├─ db/                  # Drizzle schema, migrations, RLS, queries
│  ├─ auth/                # AuthService port (magic-link + GitHub OAuth)
│  ├─ email/               # EmailService port (Resend + console adapters)
│  ├─ ui/                  # shared components
│  ├─ realtime/            # RealtimeService port (Ably/Soketi)
│  ├─ storage/             # BlobService port (Vercel Blob/S3/R2)
│  ├─ search/              # SearchService port (Postgres FTS / Typesense)
│  ├─ observability/       # vendor-neutral JSON logger
│  ├─ jobs/                # Inngest functions (Phase 1)
│  ├─ integrations/        # GitHub / Slack / etc. (Phase 2)
│  ├─ charts/              # Recharts wrappers (Phase 3)
│  ├─ docs/                # CRDT editor wrapper (Phase 4)
│  └─ ai/                  # AI assist, gated (Phase 4)
├─ docs/
│  ├─ adr/                 # Architecture Decision Records
│  └─ phase-{1,2,3,4}/     # Landing-zone notes per upcoming phase
├─ .claude/agents/         # Project-manager + specialist subagent definitions
├─ PLAN.md                 # Canonical product + architecture plan
└─ CHANGELOG.md            # Keep-a-Changelog format
```

## Working with Claude Code on this repo

The project uses a single orchestrator agent — `project-manager` — that decomposes work and delegates to specialist subagents (devops, database, security, backend, frontend, qa). All agents run on Opus.

- `.claude/agents/project-manager.md` — orchestrator instructions
- `.claude/agents/registry.md` — live list of recruited specialists
- `.claude/agents/{role}.md` — specialist scopes and standards

The agent files load as subagents in local `claude` CLI sessions. In hosted environments without custom subagent loading, treat them as architecture-of-record and dispatch work via `general-purpose` agents with role-specific briefs.

## Phase 0 progress

All 11 PRs delivered:

| PR | Title | Status |
|---|---|---|
| #1 | Bootstrap plan, PM agent, locked decisions | merged |
| #2 | Turborepo scaffold + Next.js 15 + CI baseline | shipped |
| #3 | Vercel project + env management | shipped |
| #4 | DB package: Neon + Drizzle + RLS | shipped |
| #5 | Auth: magic-link + GitHub OAuth | shipped |
| #6 | Workspace + membership + onboarding | shipped |
| #7 | Project + list + task CRUD | shipped |
| #8 | Health endpoints + Sentry + logging | shipped |
| #9 | Playwright E2E + branch protection | shipped |
| #10 | Vendor-port stubs + ESLint guard | shipped |
| #11 | PLAN.md + registry sync + Phase 1–4 skeletons | this PR |

The PRs are stacked on top of each other (CI is rate-limited so they're queued for review/merge in order).

## Phases 1–4 (sketched)

- **Phase 1 (MVP)** — kanban board, comments + @mentions, notifications, basic search, command palette. Real Ably adapter for realtime. See [`docs/phase-1/`](./docs/phase-1/).
- **Phase 2 (Scrum + GitHub)** — sprints, issue types, estimates, GitHub PR linking, webhooks. See [`docs/phase-2/`](./docs/phase-2/).
- **Phase 3 (Planning)** — Gantt + dependencies, custom fields, reports, time tracking. See [`docs/phase-3/`](./docs/phase-3/).
- **Phase 4 (Collaboration)** — docs/wiki with real-time co-editing (Yjs), presence, optional AI assist. See [`docs/phase-4/`](./docs/phase-4/).

Full details in [`PLAN.md`](./PLAN.md).
