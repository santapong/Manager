# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Phase 0 — Scaffolding

#### Added

- **Turborepo monorepo** with pnpm workspaces. Apps under `apps/`, shared packages under `packages/`, namespaced `@manager/*`. (PR #2)
- **`apps/web`**: Next.js 15 + React 19 + Tailwind 3 placeholder app. Imports `Badge` from `@manager/ui` to prove cross-package resolution works. (PR #2)
- **Stub packages**: `@manager/{config,db,auth,jobs,ui,realtime,email,storage,search}`. Each has `package.json`, `tsconfig.json`, and a placeholder `src/index.ts`. (PR #2)
- **`@manager/config`**: shared `tsconfig.base.json`, `eslint.config.mjs`, `prettier.config.mjs`, `tailwind.preset.ts`. (PR #2)
- **ESLint** at the root with `no-restricted-imports` enforcing the vendor-port boundary (PLAN.md §7) — direct imports of `@vercel/blob`, `ably`, `pusher`, `resend` are blocked outside their adapter files. (PR #2)
- **CI** (`.github/workflows/ci.yml`) running `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm build` on every PR and push to `main`. (PR #2)
- **`.claude/agents/project-manager.md`** — Opus orchestrator subagent that decomposes work, checks the registry, delegates to specialists, and recruits new ones when needed. Does not write product code itself. (PR #1)
- **`.claude/agents/devops-engineer.md`** — first recruited specialist: owns build, CI/CD, Vercel config, env management, observability. (PR #2)
- **`.claude/agents/registry.md`** — live roster of active specialist agents. (PR #1)
- **`PLAN.md`** — canonical product + architecture plan covering feature roadmap (Phase 0 → Phase 4 + continuous-delivery backlog), agent strategy, system architecture (data model, concurrency, protocols, security baseline, perf budgets, testing/CI). (PR #1)

#### Decided (see `PLAN.md` §6 for full reasoning)

- Target users: small dev teams of 3–15.
- Revenue model: free cloud + paid self-host tier. Vendor ports are mandatory from day one.
- Self-host: architectural commitment, no public date. Vendor ports enforced via ESLint.
- AI features deferred until Phase 4 or later.
- Drizzle over Prisma (edge runtime, no migrate-drift).
- Inngest for background work (avoid worker fleet).
- Vercel for v1 hosting.
- All Claude Code agents on Opus.

#### Coming next (Phase 0)

- **PR #3** — Vercel project config, env management via Zod-parsed `apps/web/src/env.ts`, `.env.example`.
- **PR #4** — Drizzle schema, Neon HTTP + Node drivers, Postgres RLS from day one, `withWorkspace()` helper, multi-tenant isolation tests.
- **PR #5** — Auth: magic link via Resend, GitHub OAuth, `AuthService` port.
- **PR #6** — Workspace + membership model, onboarding flow, middleware that propagates workspace context into RLS.
- **PR #7** — Project + list + task CRUD with optimistic UI.
- **PR #8** — Health endpoints, Sentry, structured logging via Axiom.
- **PR #9** — Playwright E2E suite + RLS isolation tests + branch protection.
- **PR #10** — `RealtimeService` / `BlobService` / `SearchService` port interfaces + ESLint guard ADR.
- **PR #11** — Sync `PLAN.md` + registry with what shipped.

#### Phases beyond 0

- **Phase 1 (weeks 3–6)** — MVP: kanban board, comments, mentions, notifications, basic search, keyboard-first command palette.
- **Phase 2 (weeks 7–10)** — Dev workflows: sprints/scrum, issue types, estimates, saved views, GitHub task↔PR linking, outbound webhooks.
- **Phase 3 (weeks 11–14)** — Planning: Gantt chart, roadmap view, dependencies, custom fields, reports (cycle time, throughput, velocity), time tracking.
- **Phase 4 (weeks 15–18)** — Collaboration: docs/wiki with real-time co-editing, presence, optional AI assist (Anthropic).

[Unreleased]: https://github.com/santapong/Manager/commits/main
