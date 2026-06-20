# AI assistant — research

Research backing the decision to add an in-app AI assistant (chat + task actions), deployed on Vercel, with a user-supplied API key in Settings. Produced 2026-06-20 by an Opus research team; verified against the Claude API reference (exact model IDs, adaptive thinking, streaming, prompt-caching rules).

The decision is recorded in [ADR 0002 — AI assistant](../../adr/0002-ai-assistant.md). These notes are the detail behind it.

## Notes

| # | Note | Owns | TL;DR |
|---|---|---|---|
| 01 | [`01-framework-and-vercel.md`](./01-framework-and-vercel.md) | tech-lead | Wrap the **official `@anthropic-ai/sdk` behind an `AIService` port** (not the Vercel AI SDK); stream from a **Node Route Handler**; long work → Inngest; default **Opus 4.8**, prompt-cache the system+tools prefix. |
| 02 | [`02-byo-key-storage.md`](./02-byo-key-storage.md) | lead-audit / security | Store the BYO key with **AES-256-GCM** (`node:crypto`, no new dep) in a new **RLS-isolated `workspace_ai_keys`** table; write-only Settings UI; validate-on-save; rotate/remove + audit log; redaction guards. |
| 03 | [`03-mcp-and-tools.md`](./03-mcp-and-tools.md) | integrations | We **already have an MCP server** and can extend it. Give the assistant actions via **in-process custom tools** for the MVP (portable, RLS-safe), with the **MCP connector** as a fast-follow sharing one tool surface. |

## Headline answers (to the original questions)

- **What framework do we add for an AI assistant on Vercel?** The official Anthropic TypeScript SDK behind our own port. The "Vercel AI SDK" ("eve framework") is optional UI sugar we're skipping to avoid lock-in.
- **Can I put the API key in Settings?** Yes — per workspace, encrypted at rest, owner/admin-only, write-only in the UI.
- **Can we add MCP?** It already exists; the assistant can use it (connector) or call the same tools in-process.

## Build phasing (flag-gated behind `AI_ENABLED`)

1. **MVP** — `AIService` port + adapter; BYO-key Settings page + `workspace_ai_keys` migration; single-turn "assist" (summarize a task/thread, draft acceptance criteria).
2. **Streaming chat** — Node Route Handler streaming; in-app chat panel.
3. **Tool actions** — in-process write tools (create/update task, move status, search) with propose→confirm→apply; wire Inngest for long runs.
4. **MCP connector** — expose the existing tool surface to the assistant + external agents over one contract.

Owners per phase are noted in each ADR section and the agent registry.
