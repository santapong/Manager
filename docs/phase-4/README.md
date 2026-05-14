# Phase 4 — Collaboration (docs, presence, optional AI)

Adds the collaborative-knowledge layer: documents/wiki with real-time co-editing (CRDT — Yjs), presence + live cursors, and an optional AI assist (Anthropic).

## Folders pre-seeded

- `apps/web/app/[workspace]/docs/`
- `packages/docs/` — CRDT editor wrapper (Yjs + TipTap/ProseMirror)
- `packages/ai/` — gated behind an AI feature flag, off by default

## Notes

- AI assist is the only place we use the Anthropic SDK directly. It sits behind its own port so swapping providers (OpenAI, Gemini) later is bounded.
- Docs are the highest-bandwidth realtime surface — RealtimeService at this scale may justify the Soketi self-host migration.
