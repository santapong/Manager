# Manager MCP server

`@manager/mcp` is a [Model Context Protocol](https://modelcontextprotocol.io) server that exposes a Manager workspace to any MCP client — Claude Desktop, Claude Code, generic MCP runners. It ships as both:

- a Node bin (`manager-mcp`) for terminal / Claude Code use, and
- a `.mcpb` bundle for one-click install into Claude Desktop.

The server is **stateless**. It speaks HTTP to a running Manager Next.js app via the `/api/v1/*` REST surface; it does not touch the database directly.

## Quick install (Claude Desktop)

1. Build the bundle: `pnpm --filter @manager/mcp build && pnpm --filter @manager/mcp mcpb`. The artifact lands at `packages/mcp/dist/manager-mcp-<version>.mcpb`.
2. Drag the `.mcpb` file onto Claude Desktop. The installer prompts for three values:
   - **Manager base URL** — e.g. `https://manager.yourcompany.com` (defaults to `http://localhost:3000` for dev).
   - **API key** — the value of `MANAGER_API_KEY` set on the Manager server (see "Auth" below).
   - **Workspace slug** — the workspace this server should act on; one install per workspace.
3. Restart Claude Desktop. The tools below appear in the tool picker.

The bundle is **unsigned** in v1 (per `docs/plans/decisions.md` §6). Claude Desktop will warn about that; that's expected until DevOps finalises the signing identity.

## Tool catalogue

| Tool | Kind | Description |
| --- | --- | --- |
| `list_projects` | read | List every project in the workspace. |
| `get_project` | read | Project detail + milestone summary + task-status counts. |
| `list_tasks` | read | Tasks in a project with optional `milestone` / `status` / `label` filters. |
| `get_task` | read | Task detail with subtasks, labels, milestone, and inbound/outbound links. |
| `list_milestones` | read | Milestones for a project with rolled-up progress. |
| `get_milestone_progress` | read | One milestone's progress + percent done. |
| `create_task` | write | Create a task; resolves tags (creating labels if needed) and `dependsOn` (creates `blocks` links). |
| `update_task_status` | write | Set a task to `open` / `in_progress` / `done`. |
| `import_plan` | write | Parse a Markdown plan, preview the diff, optionally commit it. Defaults to dry-run. |

All write tools are idempotent at the underlying-action level (importer skips existing entities; `update_task_status` is a SET, not a state-machine transition).

## Auth (v1) and the PAT follow-up

**v1 is intentionally a shortcut** so the server can ship alongside the rest of the plan-extraction work:

- A single **static API key** per Manager instance, set as `MANAGER_API_KEY` on the server. Every MCP request sends `Authorization: Bearer <key>`.
- A **workspace slug** sent as `X-Workspace-Slug: <slug>`. The server resolves the workspace row, then runs the request inside `withWorkspace(workspaceId)` so Postgres RLS scopes every query.
- If `MANAGER_API_KEY` is unset the entire `/api/v1/*` surface returns `503 auth_not_configured` — refusing to silently disable auth.

This is **not the long-term design**. The follow-up is **Personal Access Tokens**:

- Per-user tokens, scoped to the workspaces they're a member of.
- Hashed at rest with argon2id (per `integrations-engineer.md` standards), never returned after creation.
- Rotation + revocation in the UI.

When PATs ship, the MCP server's env stays the same; the value of `MANAGER_API_KEY` becomes "a PAT belonging to a service account" and the server's auth middleware learns to lookup hashed tokens.

## Env vars

| Var | Required | Default | Notes |
| --- | --- | --- | --- |
| `MANAGER_BASE_URL` | no | `http://localhost:3000` | Trailing slash is trimmed. |
| `MANAGER_API_KEY` | yes | — | Static key in v1; will become a PAT after the follow-up. |
| `MANAGER_WORKSPACE_SLUG` | yes | — | One MCP install per workspace. |

On the Manager server, set `MANAGER_API_KEY` to a long random string. **Never commit it.**

## Local dev: running the server outside Claude Desktop

```bash
pnpm --filter @manager/mcp build

MANAGER_BASE_URL=http://localhost:3000 \
MANAGER_API_KEY=dev-key-please-replace \
MANAGER_WORKSPACE_SLUG=acme \
node packages/mcp/dist/cli.js
```

Speak the MCP stdio protocol over the process's stdin/stdout, or wire it into Claude Code with a config entry.

## Constraints worth knowing

- Markdown is the only `import_plan` format in v1. CSV / XLSX are stubbed in the input schema (rejected at runtime) and land in a follow-up.
- Import commits run with `userId: null` (no session user under API-key auth), so `tasks.created_by` will be `NULL` for MCP-driven imports. Audit log surfaces will distinguish these.
- The HTTP transport (per decisions §2) is a follow-up — ships once PAT auth is in.
