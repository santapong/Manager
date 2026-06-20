// Read-only tools the AI assistant may call to look up real workspace data
// (Wave 2b, ADR 0002). Two halves live here:
//
//   1. `assistantTools()` — vendor-neutral ToolDef[] (name + description + JSON
//      Schema) handed to the model so it knows what it can call.
//   2. `executeAssistantTool()` — the dispatcher the streaming route runs for
//      each `tool_use`. It is given a `Database` ALREADY scoped to the active
//      workspace (the caller wraps it in `withWorkspace`), validates the model's
//      input defensively, and runs the existing queries.
//
// Tenancy is non-negotiable: every query is filtered by `workspaceId` and we
// NEVER trust an id supplied by the model — we look rows up by workspace +
// human key, never by raw uuid. Results are returned as a compact JSON string
// and capped in row count so a chatty tool can't blow the context window.
// READ-ONLY this wave — no create/update/delete. Writes (propose→confirm→apply)
// land in Wave 2c.
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getProjectByKey, listProjects, listTasks } from "@manager/db/queries";
import { type Database } from "@manager/db";
import { type ToolDef } from "@manager/ai";
import { listSprints } from "./sprints";

/** Cap rows in any list result so tool output stays small. */
const MAX_ROWS = 25;

const TASK_STATUS = ["open", "in_progress", "done"] as const;

/**
 * The read-only tool catalogue advertised to the model. Descriptions are
 * deliberately explicit (the model picks tools from these) and the schemas are
 * closed — `projectKey` is the human key like "ENG", never a uuid.
 */
export function assistantTools(): ToolDef[] {
  return [
    {
      name: "search_tasks",
      description:
        "Full-text search tasks across the whole workspace by keyword or exact task key (e.g. \"ENG-12\"). Use this to find tasks when you don't already know the project. Returns up to 25 matching tasks ranked by relevance.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search terms or an exact task key." },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
    {
      name: "list_projects",
      description:
        "List every project in the workspace with its key and name. Use this first to discover the available project keys.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: "list_tasks",
      description:
        "List tasks in a single project, identified by its project key. Optionally filter by status. Returns up to 25 tasks.",
      inputSchema: {
        type: "object",
        properties: {
          projectKey: { type: "string", description: 'The project key, e.g. "ENG".' },
          status: {
            type: "string",
            enum: ["open", "in_progress", "done"],
            description: "Optional status filter.",
          },
        },
        required: ["projectKey"],
        additionalProperties: false,
      },
    },
    {
      name: "get_project",
      description:
        "Get a single project's details (name, key, dates, and a task-count-by-status summary) by its project key.",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string", description: 'The project key, e.g. "ENG".' },
        },
        required: ["key"],
        additionalProperties: false,
      },
    },
    {
      name: "list_sprints",
      description:
        "List every sprint in the workspace with its project, status, dates, and task/points rollups (total and done points). Use this for sprint progress questions.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  ];
}

// Defensive input schemas — the model can produce anything, so we re-validate
// rather than trust the advertised JSON Schema. A parse failure becomes a
// friendly tool-error string the model can recover from.
const searchTasksInput = z.object({ query: z.string().trim().min(1).max(200) });
const listTasksInput = z.object({
  projectKey: z.string().trim().min(1).max(64),
  status: z.enum(TASK_STATUS).optional(),
});
const getProjectInput = z.object({ key: z.string().trim().min(1).max(64) });

/** Trim a Date to YYYY-MM-DD (or null) for compact, timezone-free output. */
function day(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

interface SearchRow {
  key: string;
  title: string;
  status: "open" | "in_progress" | "done";
  project_key: string;
}

/**
 * Dispatch one model tool call. `db` is already RLS-scoped to `workspaceId` by
 * the caller; `workspaceId` is passed through as a belt-and-suspenders filter on
 * every query (owner connections bypass RLS — PLAN §6). Returns a compact JSON
 * string; unknown tools and bad input return a short error string rather than
 * throwing, so one bad call never kills the stream.
 */
export async function executeAssistantTool(
  db: Database,
  workspaceId: string,
  name: string,
  input: unknown,
): Promise<string> {
  switch (name) {
    case "search_tasks": {
      const parsed = searchTasksInput.safeParse(input);
      if (!parsed.success) return toolError("search_tasks expects { query: string }.");
      const q = parsed.data.query;
      // FTS over the generated tsv column, mirroring the search adapter but on
      // the already-scoped tx so we stay in one transaction. Explicit
      // workspace_id filter alongside RLS.
      const rows = (await db.execute(sql`
        select t.key, t.title, t.status, p.key as project_key
        from tasks t
        join projects p on p.id = t.project_id
        where t.workspace_id = ${workspaceId}
          and (
            t.search_tsv @@ websearch_to_tsquery('english', ${q})
            or t.key ilike ${q + "%"}
          )
        order by ts_rank(t.search_tsv, websearch_to_tsquery('english', ${q})) desc,
                 t.updated_at desc
        limit ${MAX_ROWS}
      `)) as unknown as SearchRow[];
      return json({
        count: rows.length,
        tasks: rows.map((r) => ({
          key: r.key,
          title: r.title,
          status: r.status,
          projectKey: r.project_key,
        })),
      });
    }

    case "list_projects": {
      const projects = await listProjects(db, workspaceId);
      return json({
        count: projects.length,
        projects: projects.slice(0, MAX_ROWS).map((p) => ({
          key: p.key,
          name: p.name,
          startDate: p.startDate,
          targetDate: p.targetDate,
        })),
      });
    }

    case "list_tasks": {
      const parsed = listTasksInput.safeParse(input);
      if (!parsed.success) {
        return toolError("list_tasks expects { projectKey: string, status?: open|in_progress|done }.");
      }
      // Resolve the project by workspace + key; never accept a raw id.
      const project = await getProjectByKey(db, workspaceId, parsed.data.projectKey);
      if (!project) return toolError(`No project with key "${parsed.data.projectKey}".`);
      const tasks = await listTasks(db, project.id, {
        ...(parsed.data.status ? { status: parsed.data.status } : {}),
        sort: "updated",
        dir: "desc",
      });
      return json({
        projectKey: project.key,
        count: tasks.length,
        tasks: tasks.slice(0, MAX_ROWS).map((t) => ({
          key: t.key,
          title: t.title,
          status: t.status,
          priority: t.priority,
          type: t.type,
          points: t.points,
          dueAt: day(t.dueAt),
        })),
      });
    }

    case "get_project": {
      const parsed = getProjectInput.safeParse(input);
      if (!parsed.success) return toolError("get_project expects { key: string }.");
      const project = await getProjectByKey(db, workspaceId, parsed.data.key);
      if (!project) return toolError(`No project with key "${parsed.data.key}".`);
      const counts = await db.execute(sql`
        select status, count(*)::int as count
        from tasks
        where workspace_id = ${workspaceId} and project_id = ${project.id}
        group by status
      `);
      const byStatus: Record<string, number> = {};
      for (const row of counts as unknown as { status: string; count: number }[]) {
        byStatus[row.status] = Number(row.count);
      }
      return json({
        key: project.key,
        name: project.name,
        startDate: project.startDate,
        targetDate: project.targetDate,
        taskCountByStatus: byStatus,
      });
    }

    case "list_sprints": {
      const sprints = await listSprints(db, workspaceId);
      return json({
        count: sprints.length,
        sprints: sprints.slice(0, MAX_ROWS).map((s) => ({
          name: s.name,
          goal: s.goal,
          status: s.status,
          projectKey: s.projectKey,
          startAt: day(s.startAt),
          endAt: day(s.endAt),
          taskCount: s.taskCount,
          totalPoints: s.totalPoints,
          donePoints: s.donePoints,
        })),
      });
    }

    default:
      return toolError(`Unknown tool "${name}".`);
  }
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

function toolError(message: string): string {
  return JSON.stringify({ error: message });
}
