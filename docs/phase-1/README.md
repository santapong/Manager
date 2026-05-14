# Phase 1 — MVP

Target: usable for a small team's actual work. Adds kanban, comments + mentions, notifications, search, command palette.

See `PLAN.md` §2 (Phase 1) and §9 for the planned PR sequence.

## Folders pre-seeded

- `apps/web/app/[workspace]/projects/[projectKey]/board/` — kanban view (drag/drop with dnd-kit, optimistic position)
- `apps/web/app/[workspace]/inbox/` — notifications inbox
- `apps/web/app/[workspace]/search/` — cross-project search results
- `apps/web/src/lib/realtime/` — client wrapper around `RealtimeService` (Ably adapter lands first PR of Phase 1)

## Agents recruited fresh

- `realtime-engineer` (CRDT/OT, presence, WebSocket/SSE plumbing)
