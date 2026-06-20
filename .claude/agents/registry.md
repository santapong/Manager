# Agent Registry

The `project-manager` agent maintains this file. All agents run on **Opus**.

## Team structure

```
                       project-manager  (orchestrator · owns PLAN.md)
                              │
        ┌─────────────────────┼───────────────────────────────┐
   product/discovery      tech & delivery                  quality & release
   ─────────────────      ───────────────                  ─────────────────
   product-lead           tech-lead (architecture)         lead-tester ─ qa-engineer
   requirements-analyst   dev-manager (delivery)           lead-audit ─ security-engineer
   product-designer         ├─ frontend-lead ─ frontend-engineer   lead-verification (go/no-go)
                            └─ backend-lead  ─ backend-engineer
                                              ─ database-engineer
   cross-cutting ICs: devops-engineer · integrations-engineer · docs-extraction-engineer
```

Leads decide scope/decomposition and review; IC engineers implement. `tech-lead` decides *how* (architecture), `dev-manager` decides *who/when* (sequencing), `product-lead` decides *what/priority*.

## Roster

| Agent | Status | Layer | Specialty |
|---|---|---|---|
| project-manager | active | orchestrator | Decomposes work, recruits specialists, owns `PLAN.md`. |
| product-lead | active | product | Feature scoping, prioritization, trade-off arbitration. |
| requirements-analyst | active | product | Testable requirements, user stories, acceptance criteria, traceability. |
| product-designer | active | product | UX flows, design tokens, states, a11y-by-design (absorbs ui-designer). |
| tech-lead | active | tech | Architecture authority, ADRs, cross-cutting standards, design review. |
| dev-manager | active | delivery | Sprint execution, work breakdown, sequencing, blocker tracking. |
| frontend-lead | active | delivery | Frontend architecture + squad lead over frontend-engineer. |
| backend-lead | active | delivery | Server/API architecture + squad lead over backend/database engineers. |
| frontend-engineer | active | IC | Next.js App Router, RSC, Tailwind, accessibility, state. |
| backend-engineer | active | IC | Server Actions, Route Handlers, business logic, validation, permissions. |
| database-engineer | active | IC | Postgres schema, Drizzle migrations, RLS, indexing, query performance. |
| devops-engineer | active | IC | Build, CI/CD, Vercel config, env, observability, deploy verification. |
| integrations-engineer | active | IC | MCP servers + .mcpb bundles, OAuth, webhooks, public API surface. |
| docs-extraction-engineer | active | IC | Markdown/CSV/XLSX → canonical Plan IR; format specs and fixtures. |
| lead-tester | active | quality | Test strategy, coverage, CI gating; leads qa-engineer. |
| qa-engineer | active | IC | Playwright E2E, Vitest, test data, CI gating. |
| lead-audit | active | quality | Security/privacy/compliance audit, OWASP, secrets, supply chain. |
| security-engineer | active | IC | Authn/authz, tenant isolation, audit logging, secrets, fixes. |
| lead-verification | active | release | Independent V&V + go/no-go release sign-off. |

## Notes on overlap (kept intentional, scoped to avoid sprawl)

- `product-lead` (priority/arbitration) vs `requirements-analyst` (detailed testable spec) vs `product-designer` (experience). Three lenses on "what to build", not duplicates.
- `project-manager` (top orchestrator) vs `dev-manager` (engineering delivery layer) vs `tech-lead` (architecture). Distinct decision rights.
- Leads (frontend/backend/tester/audit) coordinate and review; the matching IC agents do the hands-on work. Recruit ICs in parallel on disjoint files.
- `lead-tester` finds defects / proves behavior; `lead-verification` independently signs off release readiness — kept separate on purpose.

## Anticipated (recruit on first task)

- **realtime-engineer** — presence, CRDT/OT for collaborative docs (Yjs), WebSocket/SSE plumbing.
- **ai-engineer** — AI assistant: `AIService` port, provider adapter, streaming, MCP-client tool use. Recruit when the AI assistant work starts (see `docs/research/ai-assistant-framework.md`).

## Retired

_(none yet)_
