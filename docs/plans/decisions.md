# Multi-Format Plan Extraction — Decisions

Locked-in answers to the open questions in `docs/plans/multi-format-plan-extraction.md` §8. Recorded so downstream specialists can proceed without re-litigating.

Date: 2026-05-18.
Decided by: project manager (defaults from the plan doc; user signed off with "finish that feature for me").

## 1. Markdown convention

Use CommonMark + YAML frontmatter. Heading shape:

```markdown
---
plan-format: 1
project:
  key: PROJ
  name: Project Name
  target_date: 2026-09-30
  tags: [scrum, q3]
---

# Project Name

## Milestone: Beta launch
target_date: 2026-07-15

### PROJ-1 Task title
status: todo
priority: high
tags: [backend]
depends_on: [PROJ-0]

Task description goes here. Markdown allowed.

- [ ] subtask one
- [x] subtask two
```

- `## Milestone: ...` is **optional**. A flat plan (project → tasks) is legal.
- Subtasks are `- [ ]` / `- [x]` lines under a task heading.
- Frontmatter values override inline values.

## 2. MCP transport — stdio first

Stdio ships first (it's what `.mcpb` needs for one-click Claude Desktop install). HTTP transport reuses the same tool registry and ships in Milestone D+ once PAT auth is in.

## 3. Subtasks — separate table

`subtasks` table with `task_id` FK. Not `parent_task_id` on `tasks`. Simpler permissions, lighter UI, maps cleanly to Markdown `- [ ]`. Promotion to full task is fast-follow, not v1.

## 4. Tag scope — workspace, free-form

Labels live at workspace scope. Free-form name + color. Both `task_labels` and `project_labels` join tables. Curated/locked tag lists are post-v1.

## 5. Project-level dependencies — advisory in v1

`project_links` exist and surface in the UI graph, but they don't block any actions. No "you can't start B until A's launch milestone is done" enforcement until v2.

## 6. `.mcpb` signing — defer

Build unsigned `.mcpb` in CI for now. Signing identity decision (who holds the key) deferred to a later DevOps PR; does NOT block Milestone D shipping the bundle as an unsigned developer artifact.

## 7. Import collision policy — skip + report

If a task `PROJ-12` already exists, the importer skips it and reports it in diagnostics. No update, no fail-the-whole-batch. User can re-run with `--force` (CLI/MCP) or "Update existing" toggle (UI) in v2.

## 8. Milestone scope — project-scoped

Milestones belong to one project. Release trains spanning projects are post-v1.

## 9. Launch date — distinct column

`projects.target_date` is its own column. A user can also create a milestone named "Launch" if they want; not the same thing.

## 10. Dependency graph library

Use plain SVG / minimal hand-rolled layout for v1. `react-flow` is heavy; defer until Phase 3 Gantt work justifies the dep.
