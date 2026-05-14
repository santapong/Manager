# Manager

A developer-focused project management platform (ClickUp / Jira / Linear-class). Built on Vercel; designed for swap to self-host.

**Status:** Phase 0 (scaffolding). See [`PLAN.md`](./PLAN.md) for the full roadmap and [`CHANGELOG.md`](./CHANGELOG.md) for what's landed.

## Stack at a glance

- **App**: Next.js 15 (App Router) + React 19 + Tailwind 3, in `apps/web`
- **Monorepo**: pnpm workspaces + Turborepo
- **Packages**: `@manager/{config,db,auth,jobs,ui,realtime,email,storage,search}`
- **DB** (next PR): Postgres on Neon + Drizzle ORM, multi-tenant via Postgres RLS
- **Hosting**: Vercel (paid self-host tier planned — all vendor SDKs sit behind internal ports, see [PLAN.md §7](./PLAN.md#7-vendor-ports))

## Local development

Prerequisites: Node 20+, pnpm 10+.

```sh
pnpm install
pnpm dev          # apps/web on http://localhost:3000
pnpm typecheck    # tsc --noEmit across workspaces
pnpm lint         # ESLint flat config, enforces no-restricted-imports for vendor SDKs
pnpm build        # production build
```

## Repo layout

```
manager/
├─ apps/
│  └─ web/                 # Next.js app
├─ packages/
│  ├─ config/              # shared tsconfig, eslint, prettier, tailwind preset
│  ├─ db/                  # Drizzle schema + migrations + queries (Phase 0 PR #4)
│  ├─ auth/                # AuthService port (PR #5)
│  ├─ jobs/                # Inngest functions (Phase 1)
│  ├─ ui/                  # shared shadcn/ui components
│  ├─ realtime/            # RealtimeService port — Ably / Soketi adapters
│  ├─ email/               # EmailService port — Resend / SMTP adapters
│  ├─ storage/             # BlobService port — Vercel Blob / S3 / R2 adapters
│  └─ search/              # SearchService port — Postgres FTS, Typesense later
├─ .claude/agents/         # Project-manager + specialist subagent definitions
├─ PLAN.md                 # Canonical product + architecture plan
└─ CHANGELOG.md            # Keep-a-Changelog format
```

## Working with Claude Code on this repo

The project uses a single orchestrator agent — `project-manager` — that decomposes work and delegates to specialist subagents (devops, database, auth/security, backend, frontend, qa, etc.). All agents run on Opus.

- `.claude/agents/project-manager.md` — orchestrator instructions
- `.claude/agents/registry.md` — live list of recruited specialists
- `PLAN.md` — canonical product + architecture plan, updated by the PM

The agent files work in local Claude Code sessions (`claude` CLI). In hosted environments without custom subagent loading, treat them as architecture-of-record and dispatch work via `general-purpose` agents with role-specific briefs.

## Phase 0 progress

| PR | Title | Status |
|---|---|---|
| #1 | Bootstrap plan, project-manager agent, locked decisions | merged |
| #2 | Turborepo scaffold + Next.js 15 + CI baseline | this PR |
| #3 | Vercel project + env management | pending |
| #4 | DB package: Neon + Drizzle + RLS | pending |
| #5 | Auth: magic link + GitHub OAuth | pending |
| #6 | Workspace + membership + onboarding | pending |
| #7 | Project + list + task CRUD | pending |
| #8 | Health endpoints + Sentry + logging | pending |
| #9 | Playwright E2E + branch protection | pending |
| #10 | Vendor-port stubs + ESLint guard | pending |
| #11 | PLAN.md + registry sync | pending |

Phase 0 acceptance: a deployed app on Vercel where a single user can sign in, create a workspace, and CRUD tasks, with RLS isolation enforced and Sentry capturing errors.

Phases 1–4 (MVP → Scrum → Gantt/reports → Collaboration) are sketched in [`PLAN.md §2`](./PLAN.md#2-feature-roadmap).
