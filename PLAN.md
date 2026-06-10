# Manager — Project Plan

A developer-focused project management platform (ClickUp / Jira / Linear-class). Built on Vercel first, then re-evaluate once we have real usage.

This document is canonical. The `project-manager` agent updates it as decisions are made.

---

## 1. Product vision

**One-liner.** A project management workspace built *for developers*: tasks live next to code, sprints respect PRs, and the UI stays fast because the team building it ships into it daily.

**Why not just use Jira / ClickUp?**

- Jira is heavy and slow; configuration becomes a second job.
- ClickUp is broad but generic — not opinionated for shipping software.
- Linear is excellent but closed and not extensible enough for teams that want to own their data.

**Wedge.** Tight Git integration + opinionated developer workflows (PR-driven status, branch naming, code-aware search) + a fast, keyboard-first UI.

**Non-goals (for now).**

- Marketing/CRM features
- Enterprise compliance certifications (SOC2/ISO) — design for them, but don't pursue until paid users ask
- Native mobile apps — PWA only until web parity is solid

---

## 2. Feature roadmap

Phases are sized to validate progressively. Don't start phase _N+1_ until phase _N_ is **dogfooded** by the team for at least one full sprint.

### Phase 0 — Skeleton (week 1–2)

Goal: a deployed app on Vercel that one person can sign into and create a task.

- Next.js 15 project on Vercel, preview environments wired up
- Auth (email magic link via Resend; GitHub OAuth)
- Workspace + membership model (multi-tenant from day one)
- Single project, single task list, task CRUD
- Health/status endpoint, error reporting (Sentry)

### Phase 1 — MVP, "ClickUp-lite" (week 3–6)

Goal: usable for a small team's actual work.

- Projects, lists, tasks with: status, priority, assignees, due date, labels, description (rich text)
- **Kanban board** (drag/drop status changes; optimistic UI)
- **List view** with sort/filter
- Comments + @mentions
- In-app + email notifications
- Activity feed per task
- Keyboard shortcuts (cmd-k command palette is non-negotiable)
- Basic search (Postgres full-text)

### Phase 2 — "Jira-lite", dev workflows (week 7–10)

Goal: replaces Jira/Linear for our team.

- **Sprints / Scrum** — backlog, sprint planning, sprint board, burndown
- **Issue types** — story / task / bug / epic; parent-child
- Estimates (points and/or hours)
- Saved views per project, per user
- **GitHub integration** — link tasks↔PRs↔branches; auto-update status from PR state; commit/PR mentions
- Webhooks (outbound) signed with HMAC

### Phase 3 — "Project planning" (week 11–14)

- **Gantt chart** with dependencies
- **Roadmap** view (quarterly timeline)
- Dependencies (blocks / is-blocked-by) with cycle detection
- Custom fields (text, number, select, multi-select, date, user)
- Reports — cycle time, throughput, SLA, sprint velocity
- Time tracking (manual + timer)

### Phase 4 — Collaboration & knowledge (week 15–18)

- **Documents / wiki** with real-time co-editing (CRDT)
- Presence + live cursors on tasks and docs
- Whiteboards (defer if the team isn't asking)
- Inline AI assist (task breakdown, summarize thread, draft acceptance criteria) — Anthropic Claude API

### Continuous-delivery backlog (no fixed phase)

Pull from here when a phase finishes early or a customer asks loudly:

- Automations / no-code rules ("when status = Done, …")
- Public API (OpenAPI) + personal access tokens
- SSO (SAML/OIDC), SCIM provisioning
- Audit log export
- Slack / Discord / Linear-import / Jira-import
- Forms (issue intake)
- Workload view + capacity planning
- OKRs / goals
- Recurring tasks, templates
- Marketplace / extension API
- Self-host option (we control the deps to keep this open)
- Native mobile

---

## 3. Agent strategy

Single orchestrator, specialists recruited on demand. See `.claude/agents/project-manager.md` for the full operating rules.

```
                ┌─────────────────────┐
                │   project-manager   │  (Opus, orchestrator)
                └──────────┬──────────┘
                           │ delegates
   ┌───────────────────────┼───────────────────────┐
   ▼                       ▼                       ▼
product-lead         backend-engineer       frontend-engineer
database-engineer    realtime-engineer      ui-designer
devops-engineer      security-engineer      qa-engineer
integrations-engineer
```

Rules:

- All agents run on **Opus**.
- The PM does not write product code; specialists do.
- New specialists are added to `.claude/agents/<role>.md` and listed in `.claude/agents/registry.md`.
- Retire any specialist that hasn't been used in 30 days *or* overlaps with another — agent sprawl is a smell.

---

## 4. System architecture

### 4.1 Topology

```
┌──────────────────────────────────────────────────────────────────────┐
│  Browser (Next.js client, PWA)                                        │
│    React 19 · TanStack Query · Zustand · Tailwind · shadcn/ui         │
└───────────────┬───────────────────────────────────┬──────────────────┘
                │ HTTPS (RSC + Server Actions)      │ WSS (realtime)
                ▼                                   ▼
┌──────────────────────────────────┐    ┌─────────────────────────┐
│  Vercel — Next.js 15 App Router  │    │  Ably (managed WS/SSE)  │
│   · Server Components (Node)     │    │   presence, fanout      │
│   · Edge runtime for read APIs   │    └────────────┬────────────┘
│   · Server Actions for mutations │                 │ webhooks
│   · Route Handlers (REST + WH)   │◀────────────────┘
└──────┬───────────┬─────────┬─────┘
       │           │         │
       ▼           ▼         ▼
┌──────────┐  ┌─────────┐  ┌──────────────┐
│ Neon     │  │ Upstash │  │ Inngest      │
│ Postgres │  │ Redis   │  │ background   │
│ (primary)│  │ cache + │  │ jobs, cron,  │
│          │  │ rate-lim│  │ workflows    │
└──────────┘  └─────────┘  └──────┬───────┘
                                  │
                                  ▼
              ┌─────────────────────────────────────────────────┐
              │ Outbound (all behind ports — see §7):           │
              │   Email: Resend  /  SMTP (self-host)            │
              │   Files: Vercel Blob  /  S3 · R2 (self-host)    │
              │   Realtime: Ably  /  Soketi (self-host)         │
              │   Plus: Sentry, Axiom, GitHub API (no port)     │
              └─────────────────────────────────────────────────┘
```

### 4.2 Framework & language choices

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript, strict | One language across client/server; refactors stay safe. |
| Frontend | Next.js 15 App Router, React 19 | Vercel-native, RSC reduces client JS, Server Actions cut API boilerplate. |
| UI kit | Tailwind + shadcn/ui + Radix primitives | Owned components, no lock-in, accessible. |
| Client state | TanStack Query (server cache) + Zustand (UI state) | Right tool per concern; avoid Redux complexity. |
| API style | Server Actions for app UI; REST (OpenAPI) for public API; tRPC only inside internal admin tooling | Server Actions remove a layer; public REST is what integrators expect. |
| ORM | Drizzle | SQL-first, edge-friendly, no schema-drift surprises like Prisma's migrate. |
| DB | Postgres on Neon | Serverless-native, branching for previews, scale-to-zero. |
| Cache / rate-limit | Upstash Redis | Pay-per-request, HTTP-callable from edge. |
| Background jobs | Inngest | Function-as-step model, retries, fan-out, scheduled jobs without a worker fleet. |
| Realtime | `RealtimeService` port — Ably adapter on cloud, **Soketi** adapter on self-host | Pusher-compatible wire format keeps both adapters interchangeable. |
| Search | `SearchService` port — Postgres FTS adapter both on cloud and self-host (Typesense optional later) | Don't add infra until FTS hits a wall. |
| Auth | `AuthService` port — Better-Auth (or NextAuth v5) over our own Drizzle tables | Self-owned user table; auth library is replaceable, user data is ours. |
| Email | `EmailService` port — Resend adapter on cloud, SMTP (nodemailer) on self-host | Cheap, good DX, React Email templates; SMTP is the lingua franca for self-host. |
| Files | `BlobService` port — Vercel Blob adapter on cloud, S3/R2 adapter on self-host | Vercel Blob is Vercel-only; abstracting it from day one is the price of the paid self-host tier. |
| Observability | Sentry + Axiom (no port — replace via OpenTelemetry later) | Errors + structured logs; cheap at our scale. |

### 4.3 Repo layout (Turborepo monorepo)

```
manager/
├─ apps/
│  └─ web/                 # Next.js app (only app for now)
├─ packages/
│  ├─ db/                  # Drizzle schema + migrations + queries
│  ├─ auth/                # Auth config + session helpers
│  ├─ jobs/                # Inngest functions
│  ├─ ui/                  # shared shadcn/ui components
│  ├─ realtime/            # Ably client/server wrappers
│  └─ config/              # eslint, tsconfig, tailwind preset
├─ .claude/agents/         # subagent definitions
└─ PLAN.md
```

### 4.4 Data model (initial)

Multi-tenant by `workspace_id` on every row. Hard-isolated via Postgres Row-Level Security (RLS) — never trust the client to scope queries.

Core tables (phase 1):

- `users` — id, email, name, image, github_id
- `workspaces` — id, slug, name, plan
- `memberships` — workspace_id, user_id, role (owner/admin/member/guest)
- `projects` — id, workspace_id, key, name
- `lists` — id, project_id, name, position
- `tasks` — id, workspace_id, project_id, list_id, key (`PROJ-123`), title, description, status, priority, type, assignee_id, due_at, points, position, created_by, created_at, updated_at
- `task_labels`, `labels`
- `comments` — task_id, author_id, body, mentions[]
- `activity` — append-only audit log per entity
- `notifications` — user_id, type, payload, read_at

Phase 2 adds: `sprints`, `task_links` (blocks/relates), `custom_fields`, `custom_field_values`, `time_entries`, `webhooks`, `github_links`.

### 4.5 Concurrency & "threading"

"Threading" in a serverless world means choosing the right execution context per call:

| Workload | Runtime | Why |
|---|---|---|
| Page render (RSC) | Node (Vercel function) | DB client compatibility, slightly slower cold-start but cacheable. |
| Read-only API (hot) | Edge | <50ms global p50; Drizzle works on edge with Neon HTTP driver. |
| Mutations (Server Actions, REST POST) | Node | Transactions, RLS, easier debugging. |
| Long-running (>10s) | **Inngest step function** | Vercel functions cap at 60s (Pro) and shouldn't hold state. Break into steps with retries. |
| Scheduled (cron) | Inngest cron | One place for all schedules; observability built in. |
| Fan-out (notify 50 users on a comment) | Inngest `step.run` per recipient | Parallelism without juggling Promises in a request. |

Concurrency rules:

1. **No request handler runs longer than 5s.** Anything heavier is enqueued and the client polls or subscribes via Ably.
2. **All writes are transactional.** Use Drizzle transactions; never split a write across two HTTP calls without an outbox.
3. **Optimistic UI by default.** React 19 `useOptimistic` + TanStack Query `setQueryData`; reconcile when the server confirms.
4. **Idempotency keys** on every mutation that money/notifications depend on. Stored in Redis with TTL.
5. **Per-workspace rate limiting** in Redis (sliding window).

### 4.6 Protocols

| Protocol | Where | Notes |
|---|---|---|
| HTTPS / JSON | App ↔ server, public REST | OpenAPI 3.1 spec generated from Zod schemas. |
| Server Actions (RPC over fetch) | App UI mutations | Internal only; not exposed as public contract. |
| WebSocket (Ably) | Live updates, presence | Auth via short-lived JWT minted server-side. |
| SSE | Fallback for restricted networks | Same Ably channel, transparent. |
| Webhooks (outbound) | Customer integrations | HMAC-SHA256 signed, replay-protected with timestamp, exponential retry via Inngest. |
| OAuth 2.0 + PKCE | GitHub login + integrations | Tokens encrypted at rest (libsodium sealed box). |
| SAML / OIDC | Enterprise SSO (phase 4+) | Behind a feature flag. |

### 4.7 Security baseline (non-negotiable from day one)

- Postgres RLS enabled on every multi-tenant table; tests assert isolation.
- All secrets in Vercel env vars; nothing in source.
- CSP, HSTS, secure cookies (`SameSite=Lax`, `__Host-` prefix for session).
- Argon2id for any password-equivalent material; magic-link tokens are single-use, 10-min TTL.
- Audit log for any permission/role/billing change.
- Dependabot + `npm audit` in CI; renovate weekly.

### 4.8 Performance budgets

- TTFB: p75 < 300ms globally
- Task list (50 items) interactive: < 1s on mid-range laptop
- Drag-and-drop on Kanban: < 16ms per frame; never block on the network for the *visual* update
- JS shipped to a logged-in dashboard route: < 180KB gzipped (excluding rich text editor lazy chunk)

### 4.9 Testing & CI

- **Unit / integration**: Vitest, run against a real Postgres (Neon branch per CI run)
- **E2E**: Playwright, smoke + critical paths (signup → create task → drag on board → comment → notification)
- **Type check**: `tsc --noEmit` is a required gate
- **Migrations**: Drizzle migrations applied to a CI-only Neon branch and verified to roll forward + back
- **Preview**: every PR gets a Vercel preview + a fresh Neon branch; preview URL posted on the PR

---

## 5. Risks & open questions

| Risk | Mitigation |
|---|---|
| Vercel function timeout on heavy operations | Inngest for anything > 5s; design APIs to be paginated and chunked. |
| Realtime cost spikes with Ably | Cap free workspaces; monitor msg/user; Soketi self-host adapter is the same `RealtimeService` interface (§7). |
| Vendor coupling sneaks past the port | ESLint `no-restricted-imports` rule forbids direct vendor imports outside adapter files (§7); runs on every PR. |
| ORM choice lock-in | Drizzle is thin; queries are mostly SQL — switching cost is bounded. |
| Multi-tenant data leak | RLS + automated isolation tests in CI; never bypass RLS in app code without a code-review gate. |
| Scope creep (ClickUp parity) | Phases are gated by dogfooding, not by checklist completeness. |

**Resolved questions** (see Decision log §6 for full reasoning):

1. ~~Pricing/plan model~~ — **Free cloud + paid self-host tier.** Revenue comes from self-host.
2. ~~Target team size for v1~~ — **3–15 person dev teams.** Perf budgets in §4.8 stand.
3. ~~Self-host commitment~~ — **Design for it from day one, no public date.** Vendor ports are mandatory (see §7).
4. ~~AI assist~~ — **Deferred until Phase 4 or later.** No AI SDKs land before then.

---

## 6. Decision log

The PM appends decisions here, newest first. Format: `YYYY-MM-DD — decision — reasoning`.

- 2026-06-10 — Phase 1 PRs 3–11 shipped as one stacked wave on the kickoff branch — collaboration schema, kanban board, comments/mentions, inbox, activity feed, FTS search, Cmd-K palette, list filters, and the Ably adapter (inert without `ABLY_API_KEY`). Every feature E2E-verified against a local Postgres (7 Playwright specs). FTS indexes title/description with the `english` config (queries stem the same way; `simple` kept for keys only) — the trigger sketched in the stub is obsolete.
- 2026-06-09 — Tenant scoping must not rely on RLS alone; every workspace-scoped query also filters `workspace_id` explicitly — running the E2E suite against a real Postgres proved the app requires an RLS-bypassing table-owner connection today (pre-membership flows: sessions, onboarding, invite accept), which silently disables the policies. Verified empirically: under a non-owner role the onboarding/seeding flows are blocked by the very same policies. Migrating the runtime to a non-owner role (with a sanctioned bypass path for pre-membership flows) is scheduled as Phase 1 security work; until then RLS is defense-in-depth, not the primary control.
- 2026-06-09 — Phase 1 re-sequenced at kickoff (see §9) — field wiring + member invites land first: the schema already carried `assignee_id`/`due_at`/`type`/`points` with no UI, and without invites every collaboration feature is single-player. Old P1-01 "sprint table" was a Phase 2 item; replaced by the comments/activity/notifications schema PR.
- 2026-06-09 — Mention/assign notifications insert synchronously in the same transaction; emails are best-effort post-commit — cheap same-DB writes with transactional consistency. Inngest deferred to Phase 2 (digests, due-date reminders, outbound webhooks) instead of being Phase 1 plumbing.
- 2026-06-09 — Ably adapter moved to end-of-phase stretch — every Phase 1 feature must work on the no-op `RealtimeService` (refresh/revalidate-first), per the §7 port rules. Promote to default-on in Phase 2 if dogfooding demands it.
- 2026-06-09 — Task search will use a `GENERATED ALWAYS … STORED` tsvector column + GIN index, not the trigger sketched in the FTS stub — generated columns can't drift; the column stays out of the Drizzle schema to keep `Task` types clean.
- 2026-06-09 — Invites use the magic-link token scheme (random 32 bytes, SHA-256 at rest, single-use), 7-day TTL, one pending invite per email per workspace — accept flow reads by token hash outside workspace context, same precedent as session/verification-token lookups.
- 2026-05-14 — Phase 0 shipped end-to-end as 10 stacked PRs (PRs #2–#11) — review-sized increments, each with its own typecheck/lint/build gate. See [`CHANGELOG.md`](./CHANGELOG.md) for landed-feature breakdown.
- 2026-05-14 — `typedRoutes` disabled in `next.config.ts` — query-string redirects don't satisfy the literal-route type checker. Re-enable when route surface stabilises.
- 2026-05-14 — `pnpm.overrides` pins `drizzle-orm` to a single resolution — Sentry's OpenTelemetry peer would otherwise duplicate the package and break typecheck.
- 2026-05-14 — `/api/dev/login` ships behind `DEV_LOGIN_TOKEN` + `NODE_ENV != production` — necessary to skip magic-link in Playwright; returns 404 when unconfigured so it isn't discoverable.
- 2026-05-14 — Tailwind 3 chosen over 4 — v3 is mature with the Next 15 toolchain; revisit on a focused upgrade PR after Phase 1.
- 2026-05-14 — AI features deferred until Phase 4+ — no AI SDKs, prompts, or envs land in Phase 0–3.
- 2026-05-14 — Self-host: architectural commitment, no public date — no docker/k8s assets in Phase 0; vendor ports enforced via ESLint.
- 2026-05-14 — Revenue model: free cloud + paid self-host — every vendor with a non-portable API sits behind an internal port from Phase 0.
- 2026-05-14 — Target users: dev teams of 3–15 — drives flat permission model and Phase 0 perf budgets.
- 2026-05-14 — Use Drizzle over Prisma — edge runtime support and no migrate-drift surprises.
- 2026-05-14 — Use Inngest for background work — avoids running a separate worker fleet.
- 2026-05-14 — Deploy on Vercel for v1 — fastest path; revisit if egress/realtime cost hurts.
- 2026-05-14 — All agents on Opus — user preference; revisit if cost becomes a constraint.

---

## 7. Vendor ports

Self-host is the paid tier, which means every vendor whose API is non-portable must sit behind an internal interface from day one. We abstract only where the swap is a real product feature — open standards (Postgres wire, SMTP, OAuth, OpenTelemetry) don't need a wrapper.

| Boundary | Port | Cloud impl | Self-host impl | Phase 0 deliverable |
|---|---|---|---|---|
| Realtime | `RealtimeService.{publish, authorize, presenceEnter, presenceLeave}` | Ably (Phase 1) | Soketi (Pusher-compatible) | Types + no-op adapter |
| Files | `BlobService.{putSignedUrl, getSignedUrl, delete, head}` — never expose vendor URLs to callers | Vercel Blob (Phase 1) | S3 / Cloudflare R2 | Types + noop |
| Email | `EmailService.{send({to, subject, react\|html\|text, tags})}` | Resend | SMTP (nodemailer) | Resend adapter ships in PR #5 |
| Auth | `AuthService.{getSession, requireSession, signInMagicLink, signInOAuth, signOut}` backed by our Drizzle tables | Better-Auth (or NextAuth v5) | Same code; transport is via `EmailService` port | Adapter ships in PR #5 |
| Search | `SearchService.{indexTask, removeTask, search}` | Postgres FTS (Phase 1) | Postgres FTS unchanged | Types only |

**Not abstracted:** Postgres (use Drizzle + pg wire; Neon → any Postgres is a connection-string change); Inngest (deferred to Phase 1, will gain a `JobQueue` port when it lands); Sentry/Axiom (OpenTelemetry-compatible shims later).

**Enforcement:** ESLint `no-restricted-imports` rule forbids direct imports of `@vercel/blob`, `ably`, `pusher`, `resend` outside their adapter files. Adapter files are the only allow-listed importers.

**Known coupling:** the Neon HTTP edge driver is faster than `pg` on Vercel Edge but unavailable on self-host. Document this — edge reads become Node reads on self-host. Acceptable trade for now.

---

## 8. Phase 0 — what shipped

Phase 0 closed across 10 stacked PRs (#2–#11). Reviewable in either direction; can be flattened into one merge to `main`.

| PR | Title | Highlights |
|---|---|---|
| #2 | Turborepo scaffold + CI baseline | pnpm workspaces, Turborepo, Next.js 15, Tailwind 3, ESLint guard for vendor SDKs, GH Actions CI |
| #3 | Vercel + Zod-validated env | `apps/web/src/env.ts`, `.env.example`, `vercel.json` (HSTS + security headers) |
| #4 | DB + Drizzle + RLS | Multi-tenant schema, `withWorkspace()` helper, RLS policies, isolation Vitest |
| #5 | Auth (magic-link + GitHub OAuth) | `AuthService` port, Resend + console adapters, `__Host-session` cookie, OAuth state CSRF |
| #6 | Workspaces + onboarding | `/welcome`, `[workspace]` layout, `withActiveWorkspace`, middleware, 404-not-403 isolation |
| #7 | Task CRUD | Project create, list/CRUD tasks, optimistic UI via `useOptimistic`, status cycle |
| #8 | Health + Sentry + logging | `/api/health` (edge), `/api/health/deep` (bearer), Sentry 3-runtime config, `@manager/observability` JSON logger |
| #9 | Playwright E2E | Smoke + RLS specs, `/api/dev/login` test shortcut, `.github/workflows/e2e.yml` |
| #10 | Vendor-port stubs | `RealtimeService`, `BlobService`, `SearchService` types + adapters; ADR 0001 |
| #11 | PLAN + registry sync | This PR — decision log, agent registry, Phase 1 plan |

Phase 0 acceptance (signed-in user creates workspace → project → task with RLS enforced and Sentry capturing errors) is met by PRs #5–#9.

---

## 9. Phase 1+ skeleton — landing zones

Phase 1–4 features have empty folders + planning notes scaffolded in this PR so the PM knows where each future PR should land. The folders contain `.gitkeep` files and short `PLAN.md` notes describing the feature shape, target PRs, and the agent who owns it.

### Phase 1 (MVP — kanban, comments, search)

```
apps/web/app/[workspace]/projects/[projectKey]/
├─ board/            # Kanban (frontend-engineer + backend-engineer)
└─ list/             # Already shipped in PR #7

apps/web/app/[workspace]/
├─ inbox/            # Notifications inbox (Phase 1 mid)
└─ search/           # Cross-project search results

packages/db/src/queries/
├─ comments.ts       # Database-engineer; depends on `comments` table migration
└─ activity.ts       # Activity feed reads

apps/web/src/lib/realtime/
└─ ably-client.ts    # Wraps RealtimeService port for client subscriptions
```

### Phase 2 (Scrum + GitHub integration)

Priorities (set 2026-06-09, given the codebase is ahead on types/points/subtasks/dependency-graph): (1) sprints — reuse the Phase 1 board components, burndown from `points`; (2) GitHub integration — the product wedge: PR↔task links keyed on task keys, inbound webhook driving status through the same activity/notification path; (3) saved views — persist the Phase 1 list-filter URL params; (4) first real Inngest use — due-date reminders, digests, outbound HMAC webhooks; (5) promote Ably to default-on if still deferred.

```
apps/web/app/[workspace]/sprints/
├─ page.tsx          # Sprint list
└─ [sprintId]/page.tsx

packages/db/src/queries/sprints.ts
packages/integrations/                # New package, recruit `integrations-engineer`
├─ github/
│  ├─ oauth.ts
│  ├─ pr-link.ts
│  └─ webhook-handler.ts
└─ types.ts

apps/web/app/api/webhooks/
├─ outbound/         # HMAC-signed
└─ github/route.ts   # Inbound from GitHub
```

### Phase 3 (Gantt + reports + custom fields)

```
apps/web/app/[workspace]/roadmap/
└─ page.tsx          # Quarterly Gantt + dependencies

apps/web/app/[workspace]/reports/
├─ cycle-time/page.tsx
├─ throughput/page.tsx
└─ velocity/page.tsx

packages/db/src/queries/
├─ dependencies.ts   # Cycle detection
└─ custom-fields.ts

packages/charts/                      # Phase 3 — small chart wrappers around Recharts
```

### Phase 4 (Docs + presence + AI assist)

```
apps/web/app/[workspace]/docs/
├─ page.tsx
└─ [docId]/page.tsx

packages/docs/                        # CRDT-backed editor wrapper (Yjs)
└─ src/

packages/ai/                          # Gated by AI feature flag (off by default)
└─ src/                               # Anthropic adapter only after Phase 4 starts
```

### Phase 1 PR sequence (revised 2026-06-09 at kickoff)

The first cut of this list (P1-01…P1-10) was re-sequenced before kickoff: the codebase shipped ahead of plan in `471f48d` (milestones, labels, subtasks, task links + dependency graph, plan import, MCP server, `/api/v1` reads), the old P1-01 ("sprint table") belonged to Phase 2, and two prerequisites were missing entirely — the task schema's `assignee_id`/`due_at`/`type`/`points` columns had no UI, and there was **no member-invite flow**, so every team feature (assignees, @mentions, notifications) would have been unusable single-player.

All eleven PRs below **shipped 2026-06-10** (stacked on the kickoff branch). Phase 1 is feature-complete pending dogfooding; the Ably adapter ships code-complete and stays inert until `ABLY_API_KEY` is configured.

| # | PR | Contents |
|---|---|---|
| 1 | ✅ **Task fields quick win** | Wire `assignee` / `due date` / `type` / `points` into the task drawer + list rows; `listMembers()` query; `updateTask()` gains `type` |
| 2 | ✅ **Member invites** | `invites` table (`0003_invites`, hashed single-use tokens, 7-day TTL, RLS), settings/members page, email via `EmailService` + copy-link, `/invite/[token]` accept flow, sign-in `next=` redirect |
| 3 | ✅ **Collaboration schema** (`0004_collaboration`) | `comments` (`mentions uuid[]`), `activity` (append-only, typed events, `{from,to}` jsonb), `notifications` (recipient, `read_at`, partial unread index) + RLS + queries + Vitest |
| 4 | ✅ **Kanban board** (`0005_position_double`) | dnd-kit board at `projects/[projectKey]/board`, column-per-status, fractional `position` (integer → double precision) computed server-side from neighbor IDs, optimistic moves, card opens the existing TaskDrawer |
| 5 | ✅ **Comments + @mentions UI** | Drawer comments section + mention autocomplete (`@[Name](uuid)` tokens), notifications inserted in the same transaction, best-effort mention email post-commit; assignee-change notification |
| 6 | ✅ **Inbox + unread badge** | `/[workspace]/inbox` (unread/all), mark-read / mark-all, nav badge via `countUnread`, `?task=` drawer deep-link (absorbs old P1-04 + P1-09) |
| 7 | ✅ **Activity feed per task** | Diff-based `recordActivity()` from server actions + `/api/v1` status route; drawer feed merges activity + comments |
| 8 | ✅ **Search** (`0006_search_tsv`) | `GENERATED ALWAYS … STORED` tsvector + GIN on tasks (not a trigger; column stays out of the Drizzle schema; `english` config for title/description so stemming matches, `simple` for keys), real `search()` in the Postgres-FTS adapter, `/[workspace]/search` page |
| 9 | ✅ **Cmd-K palette** (`cmdk`) | Navigate (projects/board/inbox/settings) + task search + quick actions, mounted in the workspace layout |
| 10 | ✅ **List sort + filter** | URL searchParams (`status/priority/assignee/type/sort/dir`) + `listTasks()` options + filter bar; params become Phase 2 saved-views rows verbatim |
| 11 | ✅ **Ably adapter** *(code-complete, off by default)* | Implements the existing `RealtimeService` port + token route + lazy browser subscribe helper (`router.refresh()` on event); app stays fully functional on the no-op adapter when `ABLY_API_KEY` is unset |

Deltas vs. the first cut: P1-01 sprints → collaboration schema (sprints stay Phase 2); P1-02 split into schema (3) + UI (5); P1-04 + P1-09 merged into 6; P1-05 Ably → stretch 11; P1-06 "mentions via Inngest" → synchronous in-transaction inserts (**Inngest deferred to Phase 2** for digests/reminders/outbound webhooks); P1-10 jobs wiring → Phase 2; added 1 (field wiring), 2 (invites), 10 (sort/filter).
