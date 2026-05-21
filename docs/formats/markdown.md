# Manager — Markdown Plan Format

Status: v1 (locked — see `docs/plans/decisions.md` §1)
Parser: `packages/plan-ir/src/parsers/markdown.ts`

This document specifies the Markdown convention Manager understands as a project plan. It is a strict-but-tolerant convention: importers report diagnostics rather than throwing, and most fields are optional.

## File shape

```markdown
---
plan-format: 1
project:
  key: PROJ
  name: Project Name
  target_date: 2026-09-30
  start_date: 2026-04-01
  description: One-paragraph project summary.
  tags: [scrum, q3]
---

# Project Name

## Milestone: Beta launch
target_date: 2026-07-15
status: open
description: First public beta.

### PROJ-1 Task title
status: todo
priority: high
type: task
tags: [backend]
depends_on: [PROJ-0]
assignee: dev@example.com

Task description goes here. Markdown is allowed.

- [ ] subtask one
- [x] subtask two
```

## Top-level frontmatter

| Key | Type | Required | Notes |
|---|---|---|---|
| `plan-format` | integer | yes | Must be `1`. Bumped on breaking changes. Missing key triggers a warning and assumes `1`. |
| `project.key` | string | yes | Stable per-workspace key (e.g. `PROJ`). |
| `project.name` | string | yes | Falls back to the first `# Heading` when missing. |
| `project.description` | string | no | Plain text. |
| `project.target_date` | `YYYY-MM-DD` | no | Project launch / target date. |
| `project.start_date` | `YYYY-MM-DD` | no | Optional kickoff date. |
| `project.tags` | string array | no | Workspace-scoped labels. |

## Headings

| Heading | Maps to |
|---|---|
| `# Project Name` | Project display name (only the first `#` matters). |
| `## Milestone: Beta launch` | A milestone. The `Milestone:` prefix is optional but recommended. Milestones are **optional** — flat plans (project → tasks) are legal. |
| `### KEY Task title` or `### Task title` | A task. The optional leading key (`PROJ-1`) is preserved into `task.key`. |

Tasks under a `## Milestone:` heading inherit `task.milestone = <milestone name>`. Tasks before the first milestone (or in a flat plan) have no milestone.

## Inline metadata

Immediately after a `##` or `###` heading, lines of the form `key: value` are interpreted as metadata until the first blank line. Subsequent prose becomes the heading's `description`.

### Task metadata keys

| Key | Values |
|---|---|
| `status` | `backlog`, `todo`, `in_progress`, `blocked`, `in_review`, `done`, `cancelled` |
| `priority` | `low`, `medium`, `high`, `urgent` |
| `type` | `task`, `story`, `bug`, `epic` |
| `tags` | `[a, b]` or `a, b` |
| `depends_on` | `[KEY-1, KEY-2]` |
| `assignee` | email or workspace user id |
| `key` | overrides the key parsed from the heading |
| `milestone` | overrides the surrounding milestone |

### Milestone metadata keys

| Key | Values |
|---|---|
| `target_date` | `YYYY-MM-DD` |
| `status` | `open`, `closed` |
| `description` | string |

Unknown metadata keys produce an `info` diagnostic and are ignored.

## Subtasks

Under a `###` task heading, list items of the form `- [ ]` or `- [x]` are parsed as subtasks. The text after the box becomes the subtask title; the box state becomes `done` (`x`) or not (` `).

```markdown
- [ ] Wire Google OAuth
- [x] Add session middleware
```

## Diagnostics

The parser returns a `{ ir, diagnostics }` pair. Each diagnostic has:

- `level`: `error` | `warn` | `info`
- `code`: stable string (e.g. `frontmatter/missing-project`)
- `message`: human-readable
- `line` (optional): 1-based line in the original input

The importer surfaces these in the dry-run preview before the user commits.

## Collision policy

If a task `KEY-N` already exists in the workspace, the importer **skips** it and reports it in diagnostics (see decisions §7). Update-on-collision is a v2 feature.

## Round-trip

Every `parseMarkdown` output round-trips through `serializeMarkdown` without loss for the fields covered by the schema. Whitespace and the exact ordering of optional metadata keys may differ; semantic content does not.
