# Agent Registry

The `project-manager` agent maintains this file. One line per agent. Order: most general → most specialized.

| Agent | Status | Specialty |
|---|---|---|
| project-manager | active | Orchestrates work, recruits specialists, owns `PLAN.md`. |
| devops-engineer | active | Build, CI/CD, Vercel config, env management, observability, deploy verification. |
| database-engineer | active | Postgres schema, Drizzle migrations, RLS policies, indexing, query performance. |
| security-engineer | active | Authn/authz, tenant isolation, audit logging, secrets, OWASP review. |
| backend-engineer | active | Server Actions, Route Handlers, business logic, validation, permissions. |
| frontend-engineer | active | Next.js App Router, React Server Components, Tailwind, accessibility, state. |
| qa-engineer | active | Playwright E2E, Vitest, test data, CI gating. |

## Recruited but not yet active

_(none — recruit on first need, then move to the active table above)_

## Anticipated for Phase 1+ (recruit on first task)

- **product-lead** — feature scoping, user stories, acceptance criteria, prioritization.
- **realtime-engineer** — presence, CRDT/OT for collaborative docs, WebSocket/SSE plumbing.
- **integrations-engineer** — GitHub/GitLab, Slack, webhooks, OAuth flows for third-party APIs.
- **ui-designer** — design tokens, motion, empty states, dark mode, illustration.

## Retired

_(none yet)_
