# Manager

A developer-focused project management platform (ClickUp / Jira / Linear-class). Deploying to Vercel first.

See [`PLAN.md`](./PLAN.md) for the feature roadmap, agent strategy, and system architecture.

## Working with this repo via Claude Code

This project uses a single orchestrator agent — `project-manager` — that decomposes work and delegates to specialist subagents (frontend, backend, database, realtime, devops, security, qa, etc.). All agents run on Opus.

- `.claude/agents/project-manager.md` — the orchestrator's instructions
- `.claude/agents/registry.md` — live list of recruited specialists
- `PLAN.md` — canonical product + architecture plan, updated by the PM
