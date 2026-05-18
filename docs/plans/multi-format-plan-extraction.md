# Multi-Format Plan Extraction + MCP + Project Visualization

**Status:** Draft plan — not yet implemented.
**Branch:** `claude/multi-format-plan-extraction-X2d33`
**Owner (orchestrator):** `project-manager`
**Date:** 2026-05-18

This document decomposes the user request into work streams, maps each to a specialist agent, and proposes a phased rollout. It is the planning artifact for the feature set; specs (`docs/specs/<feature>.md`) and PR-level work will follow.

---

## 1. User request (verbatim)

1. Extract project plans from Markdown using a specific format. Support more formats too — CSV, Excel, and more.
2. An MCP server to let an AI agent drive Manager, plus a `.mcpb` bundle for Claude Desktop.
3. See the project plan and milestones clearly.
4. Scrum love: project tags and a clear launch date / target date.
5. See when projects chain or depend on other projects.
6. See task descriptions and subtasks inline.

## 2. What exists in the repo today (state-of-the-world)

Phase 0 is the only thing that has shipped end-to-end. Relevant facts:

- **App:** Next.js 15 App Router at `apps/web`, multi-tenant via Postgres RLS (`packages/db/src/rls.ts`).
- **Schema (`packages/db/src/schema/`):** `users`, `workspaces`, `memberships`, `projects`, `lists`, `tasks`. Tasks already have: `key`, `title`, `description`, `status`, `priority`, `type` (task/story/bug/epic), `assigneeId`, `dueAt`, `points`, `position`. Projects have `key`, `name`, `nextTaskSeq`. **No** milestones, tags/labels, task dependencies, parent-child links, or subtasks yet.
- **No `packages/plan-ir/`**, no `packages/mcp/`, no importer code, no MCP server, no `.mcpb` artifact. The `docs-extraction-engineer` and `integrations-engineer` are recruited (`.claude/agents/`) but have not produced any code yet.
- **Phase 2 (Scrum, sprints, GitHub integration)** and **Phase 3 (Gantt, dependencies, custom fields, roadmap)** are stubbed in `PLAN.md` §9 but not implemented. The user's requests #3–#6 are exactly those phases.
- **Vendor ports** (`RealtimeService`, `BlobService`, `SearchService`, `EmailService`, `AuthService`) exist as type stubs (`packages/realtime`, `packages/storage`, etc.). File uploads will need `BlobService` to gain an adapter.

Implication: requests #1 and #2 are net-new packages. Requests #3–#6 require schema extensions (milestones, tags, dependencies, subtasks) that effectively pull Phase 2/3 work forward.

## 3. Scope honesty — call out the size

This is **a lot** for one feature pass:

- Multi-format parsing (Markdown + CSV + Excel + "more") with a canonical IR, round-trip, and diagnostics.
- An MCP server (stdio + HTTP transports) wrapping the same service the importer uses.
- A `.mcpb` bundle (signed, manifest, icon, publishable artifact) for Claude Desktop.
- New schema: milestones, tags, dependencies, subtasks.
- New views: milestone/roadmap, tag-filtered board, dependency graph, subtask drawer.

**Recommendation:** treat this as **a new mini-phase** ("Phase 1.5 — Plan I/O & Visibility") that runs alongside Phase 1, and ship it across 3 milestones (see §7). Do **not** try to ship all six items in one PR or even one sprint.

## 4. Interpretations and deliverables, request by request

### Request 1 — Multi-format plan extraction

**Interpretation.** The user writes (or exports from another tool) a plan file. Manager parses it into projects/milestones/tasks/subtasks, shows a dry-run diff, and on confirmation creates the entities transactionally. Markdown is the primary format with a documented convention; CSV and XLSX are template-driven; "more" means a roadmap (OPML, JSON, Jira/Linear exports) we add behind the same IR.

**Deliverables.**

- [ ] `packages/plan-ir/` — Zod schema for canonical `PlanIR` (workspace? → projects → milestones → tasks → subtasks; tags, dependencies, due dates, owners, descriptions, custom fields passthrough).
- [ ] `packages/plan-ir/src/parsers/markdown.ts` — CommonMark + YAML frontmatter; `plan-format: 1` versioning.
- [ ] `packages/plan-ir/src/parsers/csv.ts` — RFC 4180; documented header contract.
- [ ] `packages/plan-ir/src/parsers/xlsx.ts` — SheetJS or `exceljs`; "Manager Plan" workbook template.
- [ ] `packages/plan-ir/src/serializers/` — round-trip back to MD/CSV/XLSX.
- [ ] `packages/plan-ir/fixtures/` — golden files (happy path, edge cases, malformed).
- [ ] `docs/formats/{markdown,csv,xlsx}.md` — format specs (the "specific format" the user mentioned).
- [ ] `apps/web/app/[workspace]/import/page.tsx` — file upload + dry-run preview/diff UI.
- [ ] `apps/web/src/server/imports/` (backend) — import service: takes `PlanIR`, runs in a Drizzle transaction with RLS, returns created entity IDs + diagnostics.
- [ ] Route handler / Server Action: `POST /api/imports/preview` (dry-run) and `POST /api/imports/commit`.
- [ ] Downloadable XLSX template (served from `BlobService` once a Vercel Blob adapter lands; until then static asset).

**Owning agents.**

- `docs-extraction-engineer` — owns the IR, parsers, serializers, format specs, fixtures.
- `backend-engineer` — owns the import service, route handlers, transactional commit, RLS-safe writes.
- `database-engineer` — owns schema additions required by the IR (milestones, tags, dependencies, subtasks — see request 3–6).
- `frontend-engineer` — owns the upload page, preview/diff UI, file-picker, progress.
- `security-engineer` — reviews file-size caps, content-type sniffing, zip-slip on XLSX, SSRF if we ever fetch a URL.
- `qa-engineer` — fixtures-driven parser tests in Vitest; Playwright E2E for the upload flow.

**Dependencies.**

- Schema additions (milestones/tags/dependencies/subtasks) are a hard prerequisite for round-tripping requests 3–6 through the IR. **Do this schema work first**, then build parsers against it.
- Importer cannot reach prod usefully until at least the "milestones + tags + subtasks" schema lands.
- File upload UI depends on a real `BlobService` adapter (Vercel Blob) — until then accept paste-in text and direct file uploads (multipart) handled by the Server Action.

**Open questions.**

- Markdown convention exact shape: is `## Milestone` mandatory, or can a plan be flat (project → tasks)?
- On import collision (task `PROJ-12` already exists), do we update, skip, or fail the whole batch?
- Tag namespace: workspace-scoped or project-scoped? (Affects schema.)

### Request 2 — MCP server + `.mcpb` bundle

**Interpretation.** Expose Manager's safe operations (create project, list tasks, create task, import-plan, get-milestones, etc.) as MCP tools so Claude Desktop or any MCP client can drive Manager on a user's behalf. Bundle the server as a signed `.mcpb` for one-click install in Claude Desktop.

**Deliverables.**

- [ ] `packages/mcp/` — tool registry, shared JSON schema (drives both the MCP server and OpenAPI doc generation later).
- [ ] `packages/mcp/src/server.ts` — stdio + streamable HTTP transports; auth via Personal Access Token (PAT).
- [ ] Tools (v1): `list_projects`, `get_project`, `list_tasks`, `get_task`, `create_task`, `update_task_status`, `import_plan` (accepts file content or IR), `list_milestones`, `get_milestone`.
- [ ] PAT issuance + management UI (settings page) — tokens hashed at rest (argon2id), scoped to workspace + scopes.
- [ ] `apps/mcp/` or `packages/mcp/dist/` build target for the bundle.
- [ ] `manifest.json` for `.mcpb` + icon + signing pipeline in CI.
- [ ] CI job that produces a `manager-mcp-x.y.z.mcpb` artifact on tag.
- [ ] `docs/integrations/mcp.md` — tool catalog, auth flow, install instructions for Claude Desktop.

**Owning agents.**

- `integrations-engineer` — owns the MCP server, tool registry, `.mcpb` packaging, manifest, signing.
- `security-engineer` — owns PAT format, scopes, hashing, tenant isolation under agent auth, rate-limit per token.
- `backend-engineer` — owns the underlying service calls each MCP tool wraps (must be identical to the importer's services — no duplication).
- `devops-engineer` — owns CI publishing (artifact on release tag), signing keys in env, .mcpb checksum.
- `qa-engineer` — MCP tool contract tests (in-process server harness + Vitest); a smoke test that loads the `.mcpb` zip.

**Dependencies.**

- Hard dep on Request 1: the `import_plan` MCP tool wraps the same import service. Don't build the MCP before the service exists.
- Hard dep on PAT auth — cannot ship MCP without it, and it doesn't exist yet (auth currently is session cookies + OAuth, no PAT).
- `.mcpb` signing requires a publishing identity decision (which key, who holds it). Coordinate with `devops-engineer`.

**Open questions.**

- Should the MCP server run **in-process** in `apps/web` (HTTP transport, deployed on Vercel) or **separately** as a Node binary that the user runs locally (stdio transport via `.mcpb`)? Likely both, with the same tool registry — confirm with user.
- Mutation scope for v1: read-only first, or read+write from day one? Read-only is safer; write needs an audit trail surface.
- Do we expose `delete_*` tools at all in v1? Recommend no.

### Request 3 — Project plan & milestones, visible

**Interpretation.** A first-class **Milestone** concept that groups tasks toward a date, plus a project-overview view that shows progress against milestones (count, % done, slipping).

**Deliverables.**

- [ ] Schema (`packages/db/src/schema/milestones.ts`): `id`, `workspace_id`, `project_id`, `name`, `description`, `target_date`, `status` (open/closed), `position`. Add `milestone_id` (nullable FK) on `tasks`.
- [ ] Drizzle migration + RLS policies for `milestones` table.
- [ ] Queries: `milestones.list(projectId)`, `milestones.progress(milestoneId)` (counts of open/done tasks).
- [ ] UI: `apps/web/app/[workspace]/projects/[projectKey]/milestones/page.tsx` — list with progress bars, target dates, slip indicator.
- [ ] UI: milestone picker on task create/edit.

**Owning agents.** `database-engineer` (schema + queries), `backend-engineer` (service + actions), `frontend-engineer` (views), `qa-engineer` (RLS test for milestone isolation, E2E for milestone-driven board filter).

**Dependencies.** Should ship before parser round-trip support for `## Milestone`.

**Open questions.**

- Are milestones project-scoped only, or can they span projects (release trains)? Recommend project-scoped for v1.

### Request 4 — Scrum-friendly tags & launch dates

**Interpretation.** "Tags" = labels on tasks AND projects (the user said "project tags"). "Launch date" = an explicit `target_date` on the project. Scrum framing implies these should also flow through the importer (tag a task `sprint-3`, set its milestone, see it on the board).

**Deliverables.**

- [ ] Schema: `labels` (workspace-scoped, color, name) and `task_labels` join table. **Also** allow labels on projects (`project_labels` join) since the user said "project tags".
- [ ] Schema: add `target_date` (and optional `start_date`) to `projects`.
- [ ] UI: tag chips on cards, tag filter on board and list views, tag manager in workspace settings.
- [ ] UI: project header shows `Launch: 2026-Q3` style date with status (on-track/at-risk/slipped — driven by milestone completion).
- [ ] IR support for `tags: [...]` in frontmatter and a `Tags` column in CSV/XLSX.

**Owning agents.** `database-engineer`, `backend-engineer`, `frontend-engineer`, `docs-extraction-engineer` (IR + parser updates), `qa-engineer`.

**Dependencies.** Schema lands with milestones in the same DB PR to keep migrations tidy.

**Open questions.**

- Are tags free-form per-workspace, or is there a curated tag list owners can lock down?
- "Launch date" — is it the same as a project-wide milestone called "Launch", or a distinct column? Recommend distinct column (simpler), with a "launch milestone" convention layered on top if needed.

### Request 5 — Project chaining / dependencies

**Interpretation.** User wants to see when one project (or task) depends on another, and visualize the chain. Two levels: **task-level** dependencies (blocks / is-blocked-by) and **project-level** dependencies (Project B can't start until Project A's "Launch" milestone is done).

**Deliverables.**

- [ ] Schema: `task_links` (from_task_id, to_task_id, type ∈ {blocks, relates, duplicates}). Cycle detection (server-side, never client).
- [ ] Schema: `project_links` (from_project_id, to_project_id, type ∈ {depends_on, relates}). Cycle detection too.
- [ ] Queries: topological sort helpers; "what is blocking task X?" / "what does project Y unblock?".
- [ ] UI: dependency drawer on a task; a project-level **dependency graph** view (simple node-edge layout — defer fancy Gantt to Phase 3, but a basic graph is in scope here).
- [ ] IR support: `dependsOn: [PROJ-12, OTHER-5]` in frontmatter and a `Depends On` column in CSV/XLSX.
- [ ] Import-time validation: reject the import (with diagnostics) if it creates a cycle.

**Owning agents.** `database-engineer` (schema, cycle detection SQL/recursive CTE), `backend-engineer` (validation, services), `frontend-engineer` (graph view — likely `react-flow` or a simple SVG until Phase 3 adopts a charting lib), `docs-extraction-engineer` (IR), `qa-engineer` (cycle-detection unit tests).

**Dependencies.** Schema ships with milestones+tags.

**Open questions.**

- Do project-level dependencies block UI actions (can't start tasks in B until A's launch milestone done), or are they advisory in v1? Recommend advisory.
- Graph layout library: `react-flow` (heavy, polished) vs hand-rolled (cheap, limited). Decide before frontend starts.

### Request 6 — Descriptions & subtasks inline

**Interpretation.** When viewing a task on the board/list, the user can see (and edit) the description and any subtasks without leaving the row — either via an expandable row, a side drawer, or a hover-card. Subtasks are first-class but lighter than tasks (no key, no status enum complexity — just done/not-done + title + assignee).

**Deliverables.**

- [ ] Schema: `subtasks` table (`id`, `workspace_id`, `task_id`, `title`, `done`, `assignee_id`, `position`). Alternatively reuse `tasks` with `parent_task_id` — **decision point**, recommend separate `subtasks` table for v1 (simpler permissions, lighter UI, and matches Markdown `- [ ] subtask` convention).
- [ ] Queries + Server Actions: add/edit/toggle/reorder subtasks.
- [ ] UI: task detail drawer (right-side sheet) that opens on row click and shows description (rich text — reuse the editor from PR #7), subtasks list with inline add, comments tab (already on roadmap for Phase 1).
- [ ] Inline preview: task card on the board shows description **excerpt** (first 120 chars) and a `2/5` subtask progress indicator.
- [ ] IR support: subtasks parsed from Markdown `- [ ] ...` lines under a `### Task` heading; CSV/XLSX use a `Subtasks` column with `|` or newline delimiter.

**Owning agents.** `database-engineer`, `backend-engineer`, `frontend-engineer`, `docs-extraction-engineer`, `qa-engineer`.

**Open questions.**

- Subtask vs. real task: the user might want subtasks promoted into full tasks later. Should we support promotion in v1? Recommend no, fast-follow.
- Rich text in description: keep the Phase 0 editor or upgrade? Stay with current to avoid scope.

## 5. Cross-cutting agent queues

### `docs-extraction-engineer`

- [ ] Define `PlanIR` Zod schema (covers projects, milestones, tasks, subtasks, tags, dependencies, dates, descriptions, owner refs).
- [ ] Markdown parser + serializer + spec (`docs/formats/markdown.md`).
- [ ] CSV parser + serializer + spec.
- [ ] XLSX parser + serializer + template + spec.
- [ ] Fixture set: happy path, edge cases, malformed, large file streaming.
- [ ] Dry-run diff calculator: IR vs current workspace state → `Diff` object the frontend renders.

### `integrations-engineer`

- [ ] `packages/mcp/` scaffold + tool registry pattern.
- [ ] Stdio + streamable HTTP transports.
- [ ] Auth integration with PAT (consumes, doesn't design — see security).
- [ ] `.mcpb` manifest, icon, build pipeline, CI artifact.
- [ ] `docs/integrations/mcp.md` — tools, install, troubleshooting.

### `database-engineer`

- [ ] Migration: `milestones` table + `tasks.milestone_id`.
- [ ] Migration: `labels`, `task_labels`, `project_labels` tables.
- [ ] Migration: `projects.target_date`, `projects.start_date`.
- [ ] Migration: `task_links`, `project_links`.
- [ ] Migration: `subtasks`.
- [ ] RLS policies on all new tables + isolation Vitest specs.
- [ ] Cycle detection helpers (recursive CTE).

### `backend-engineer`

- [ ] Import service: `previewImport(ir)` and `commitImport(ir)` — transactional, RLS-safe.
- [ ] CRUD services for milestones, labels, links, subtasks.
- [ ] PAT issuance/verification middleware (with `security-engineer`).
- [ ] MCP tool implementations call these services (no duplication).
- [ ] Validation with Zod at every boundary.

### `frontend-engineer`

- [ ] `/import` page: upload, paste, preview, diff, commit.
- [ ] Milestone list view + progress bars + project header chips.
- [ ] Tag manager + tag chips + tag filter.
- [ ] Task detail drawer with description + subtasks + tags.
- [ ] Project dependency graph view (simple node-edge).
- [ ] PAT management UI in settings.
- [ ] Cmd-K palette entry: "Import plan", "Open milestones", "Manage tokens".

### `security-engineer`

- [ ] PAT format + scopes + storage (argon2id) + rotation.
- [ ] File-upload threat model: size caps, MIME sniffing, zip-slip on XLSX, formula injection in CSV (`=CMD(...)`).
- [ ] MCP authZ: every tool call resolves a workspace and runs under RLS for that workspace's owner — never a global admin context.
- [ ] Audit log entries for: import committed, PAT created/revoked, milestone target date changed.

### `devops-engineer`

- [ ] CI: `pnpm --filter @manager/plan-ir test` + fixture parity.
- [ ] CI: `.mcpb` build + signing on release tag.
- [ ] Env: `INTEGRATIONS_ENC_KEY`, `MCP_SIGNING_KEY`, file-upload size limit configurable per env.
- [ ] Vercel function size: confirm `xlsx`/`exceljs` does not bust the 50 MB function bundle limit; if so, route XLSX parsing through an Inngest job.

### `qa-engineer`

- [ ] Vitest: per-parser fixture-driven tests (parse + serialize + round-trip equality).
- [ ] Vitest: importer transactionality (kill mid-commit, no orphans).
- [ ] Vitest: cycle detection on `task_links` and `project_links`.
- [ ] Playwright: upload Markdown → preview → commit → see milestones + tasks → board reflects.
- [ ] Playwright: create PAT → call MCP tool over HTTP → 200 → see audit log entry.
- [ ] Contract test for MCP tool registry (every tool has a schema, name, description, handler).

### `product-lead` (recruit a feature spec from them)

- [ ] `docs/specs/plan-import.md` — acceptance criteria, slicing, open questions resolved.
- [ ] `docs/specs/mcp-integration.md` — tool catalog rationale, scopes, v1 boundary.

## 6. Risks

| Risk | Mitigation |
|---|---|
| Schema bloat lands before users validate it | Ship milestones + tags first (request 3, 4); defer task/project links and subtasks one PR each. |
| XLSX library blows Vercel function bundle | Confirm bundle size early; fall back to Inngest job for parse if >20 MB. |
| `.mcpb` signing has no owner | Decide signing identity before opening MCP work; do not block on it for the HTTP transport. |
| Markdown convention diverges from what users actually write | Publish format spec early, get user to write one real plan against it before parser is finalized. |
| MCP exposes mutations without audit trail | Audit log is a hard gate for write tools; read-only ships first if audit isn't ready. |
| Cycle detection on huge graphs | Constrain to ≤ 500 nodes per workspace in v1; reject larger imports with a clear error. |

## 7. Phased rollout

Treat this as **Phase 1.5**, runs alongside Phase 1.

### Milestone A — "Schema + basic visibility" (smallest viable wedge)

Ships request 3 and the visible parts of request 4 + 6. No parsers yet.

1. DB migrations: `milestones`, `labels` + joins, `projects.target_date`, `subtasks`, RLS + isolation tests.
2. Services + Server Actions for milestones, tags, subtasks.
3. UI: milestone list view, tag manager + chips, task detail drawer with description + subtasks.
4. Project header shows launch date and milestone progress.

**Exit criteria:** the team can dogfood milestones, tags, subtasks for one sprint without touching the importer.

### Milestone B — "Plan import (Markdown only)"

Ships the core of request 1 against the schema from Milestone A.

1. `packages/plan-ir/` + `PlanIR` Zod schema.
2. Markdown parser + serializer + format spec.
3. Import service (preview + commit).
4. `/import` page with diff preview.
5. E2E test: paste markdown → preview → commit → see milestones + tasks.

**Exit criteria:** user can paste a Markdown plan and have it create a project with milestones + tagged tasks + subtasks.

### Milestone C — "CSV + XLSX + dependencies"

Ships the rest of request 1, plus request 5 (dependencies).

1. CSV + XLSX parsers + templates + specs.
2. `task_links` + `project_links` migrations + cycle detection.
3. Dependency graph view (simple).
4. Importer rejects cycles with helpful diagnostics.

**Exit criteria:** import an Excel file with dependencies → see graph → no cycles allowed.

### Milestone D — "MCP server + `.mcpb`"

Ships request 2.

1. PAT auth (security-engineer leads).
2. `packages/mcp/` + read-only tools.
3. Audit log for write tools.
4. Write tools (`create_task`, `update_task_status`, `import_plan`).
5. `.mcpb` bundle + signed CI artifact + install docs.

**Exit criteria:** Claude Desktop installs the `.mcpb` and can list/create tasks in a real workspace via a PAT.

### Out of scope for this feature pass

- Full Gantt chart (stays in Phase 3).
- Burndown / velocity / reports (Phase 3).
- Sprints proper (Phase 2 — tags are a poor-man's-sprint until then).
- Bidirectional sync with Jira/Linear (post-Phase-4).
- AI-assisted plan generation (Phase 4).

## 8. Top open questions to resolve before kickoff

1. **Markdown convention** — exact heading levels, required vs optional, frontmatter keys. Publish a draft spec as the first deliverable and have the user write one real plan against it.
2. **MCP transport** — stdio (local Node binary in `.mcpb`) vs HTTP (deployed on Vercel) — likely both, but which ships first?
3. **Subtasks: separate table or `parent_task_id` on `tasks`?** Recommend separate; needs sign-off because it affects everything downstream.
4. **Tag scope** — workspace vs project, free-form vs curated.
5. **Project-level dependencies** — advisory or enforcing in v1?
6. **`.mcpb` signing identity** — who owns the key, who signs releases.

## 9. Mapping to `PLAN.md` phases

This feature set straddles phases:

- Request 3 (milestones) is **new** — `PLAN.md` doesn't list milestones explicitly; add to Phase 2 scope.
- Request 4 (tags, launch date) — labels are Phase 1 in PLAN.md; project-level tags + target date are new.
- Request 5 (dependencies) is **Phase 3** in PLAN.md — pulled forward.
- Request 6 (subtasks) — implicit in Phase 2's "parent-child" issue types but not built; pulled forward.
- Requests 1 and 2 (import + MCP) are **not in PLAN.md** — proposed as Phase 1.5 / Continuous-delivery backlog graduates.

After this plan is approved, `PLAN.md` Decision Log and Phase 2/3 sections must be updated to reflect the pulled-forward scope.
