# Phase 2 — Scrum + GitHub integration

Adds sprints, issue types, estimates, saved views, and GitHub PR linking. This is the phase that replaces Jira/Linear for the team using it.

## Folders pre-seeded

- `apps/web/app/[workspace]/sprints/`
- `apps/web/app/api/webhooks/outbound/` — HMAC-signed webhook delivery
- `apps/web/app/api/webhooks/github/route.ts` — inbound PR events
- `packages/integrations/github/` — GitHub OAuth flow + PR linker

## Agents recruited fresh

- `integrations-engineer` (third-party APIs, OAuth, webhooks)
- `product-lead` (sprint UX, estimate semantics)
