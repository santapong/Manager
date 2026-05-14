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
              ┌────────────────────────────────────┐
              │ Outbound: Resend (email), Sentry,  │
              │ Axiom (logs), Vercel Blob (files), │
              │ GitHub API (integrations)          │
              └────────────────────────────────────┘
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
| Realtime | Ably (or Pusher) | Managed WS + presence + history; self-host (Soketi) later if cost justifies. |
| Search | Postgres FTS (phase 1) → Typesense (phase 2+) | Don't add infra until FTS hits a wall. |
| Auth | Better-Auth (or NextAuth v5) | Self-owned user table; supports email magic link, OAuth, SSO later. |
| Email | Resend | Cheap, good DX, React Email templates. |
| Files | Vercel Blob | One-click; swap for R2 if egress matters. |
| Observability | Sentry + Axiom | Errors + structured logs; cheap at our scale. |

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
| Realtime cost spikes with Ably | Cap free workspaces; monitor msg/user; have Soketi self-host plan ready. |
| ORM choice lock-in | Drizzle is thin; queries are mostly SQL — switching cost is bounded. |
| Multi-tenant data leak | RLS + automated isolation tests in CI; never bypass RLS in app code without a code-review gate. |
| Scope creep (ClickUp parity) | Phases are gated by dogfooding, not by checklist completeness. |

**Open questions for the user (decide before phase 1 starts):**

1. Pricing/plan model — free tier limits? per-seat vs flat?
2. Target team size for v1 — 5-person startups, or 50-person eng orgs? (affects perf budgets and admin surface)
3. Self-host commitment — do we promise it publicly? (affects vendor choices like Ably vs Soketi from day one)
4. AI assist — Anthropic only, or BYO-key for customers?

---

## 6. Decision log

The PM appends decisions here, newest first. Format: `YYYY-MM-DD — decision — reasoning`.

- 2026-05-14 — Use Drizzle over Prisma — edge runtime support and no migrate-drift surprises.
- 2026-05-14 — Use Inngest for background work — avoids running a separate worker fleet.
- 2026-05-14 — Deploy on Vercel for v1 — fastest path; revisit if egress/realtime cost hurts.
- 2026-05-14 — All agents on Opus — user preference; revisit if cost becomes a constraint.
