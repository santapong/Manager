# Phase 1 — MVP

Target: usable for a small team's actual work. Adds member invites, full task
fields, kanban, comments + mentions, notifications, search, command palette.

See `PLAN.md` §2 (Phase 1) and §9 for the revised PR sequence (2026-06-09).

## Sequence at a glance

1. ✅ Task fields quick win — assignee / due date / type / points wired into drawer + list
2. ✅ Member invites — `invites` table, settings/members page, `/invite/[token]` accept flow
3. Collaboration schema — `comments` / `activity` / `notifications` (+ RLS, queries)
4. Kanban board — dnd-kit, column-per-status, fractional positions
5. Comments + @mentions UI — in-transaction notifications, best-effort email
6. Inbox + unread badge
7. Activity feed per task
8. Search — generated tsvector + GIN, real FTS adapter, `/[workspace]/search`
9. Cmd-K command palette (`cmdk`)
10. List sort + filter (URL params → Phase 2 saved views)
11. *(stretch)* Ably adapter behind the existing `RealtimeService` port

## Folders pre-seeded

- `apps/web/app/[workspace]/projects/[projectKey]/board/` — kanban view (drag/drop with dnd-kit, optimistic position)
- `apps/web/app/[workspace]/inbox/` — notifications inbox
- `apps/web/app/[workspace]/search/` — cross-project search results
- `apps/web/src/lib/realtime/` — client wrapper around `RealtimeService` (Ably adapter is the end-of-phase stretch PR)

## Agents recruited fresh

- `realtime-engineer` (CRDT/OT, presence, WebSocket/SSE plumbing) — first needed for the stretch PR
