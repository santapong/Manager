// Tools the AI assistant may call against real workspace data (Wave 2b reads,
// Wave 2c gated writes; ADR 0002). Three halves live here:
//
//   1. `assistantTools()` — vendor-neutral ToolDef[] (name + description + JSON
//      Schema) handed to the model so it knows what it can call.
//   2. `executeAssistantTool()` — the READ dispatcher. Given a `Database`
//      ALREADY scoped to the active workspace (the caller wraps it in
//      `withWorkspace`), it validates the model's input defensively and runs the
//      existing queries, returning a compact JSON string.
//   3. `runAssistantTool()` — the dispatcher the streaming route actually calls.
//      It distinguishes reads from writes: reads delegate to
//      `executeAssistantTool` (`{ forModel }`); WRITES are turned into
//      *proposals* — the input is validated, the project/task is resolved by
//      key + workspace to confirm it EXISTS, and a proposal object is returned
//      ({ forModel, proposal }). A write tool NEVER mutates the database. The
//      only path that writes is `applyProposalAction` after the user confirms.
//
// Tenancy is non-negotiable: every query is filtered by `workspaceId` and we
// NEVER trust an id supplied by the model — we look rows up by workspace +
// human key, never by raw uuid. Read results are capped in row count so a
// chatty tool can't blow the context window.
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getProjectByKey, listProjects, listTasks } from "@manager/db/queries";
import { lists, tasks as tasksTable, type Database } from "@manager/db";
import { type ToolDef } from "@manager/ai";
import {
  TaskPriorityEnum,
  TaskStatusEnum,
  TaskTypeEnum,
} from "@/src/lib/validators/task";
import { type AssistantProposal } from "@/src/lib/validators/ai";
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
    {
      name: "create_task",
      description:
        "PROPOSE creating a new task in a project. This does NOT create anything — it shows the user a confirmation card; they must click Confirm to apply it. Use it when the user asks to add/create a task. Keep the title short and the proposal minimal.",
      inputSchema: {
        type: "object",
        properties: {
          projectKey: { type: "string", description: 'The project key, e.g. "ENG".' },
          title: { type: "string", description: "Short task title (1–200 chars)." },
          description: { type: "string", description: "Optional longer description." },
          priority: {
            type: "string",
            enum: ["low", "medium", "high", "urgent"],
            description: "Optional priority (defaults to medium).",
          },
          type: {
            type: "string",
            enum: ["task", "story", "bug", "epic"],
            description: "Optional work item type (defaults to task).",
          },
        },
        required: ["projectKey", "title"],
        additionalProperties: false,
      },
    },
    {
      name: "update_task",
      description:
        "PROPOSE editing an existing task's fields. This does NOT change anything — it shows the user a confirmation card they must Confirm. Identify the task by its key (e.g. \"ENG-12\"). Include only the fields you want to change.",
      inputSchema: {
        type: "object",
        properties: {
          taskKey: { type: "string", description: 'The task key, e.g. "ENG-12".' },
          title: { type: "string", description: "New title (1–200 chars)." },
          description: { type: "string", description: "New description." },
          priority: {
            type: "string",
            enum: ["low", "medium", "high", "urgent"],
            description: "New priority.",
          },
          status: {
            type: "string",
            enum: ["open", "in_progress", "done"],
            description: "New status.",
          },
          points: { type: "integer", description: "New story points (0–100)." },
        },
        required: ["taskKey"],
        additionalProperties: false,
      },
    },
    {
      name: "move_task",
      description:
        "PROPOSE moving a task to a different status column (open, in_progress, or done). This does NOT move anything — it shows the user a confirmation card they must Confirm. Identify the task by its key (e.g. \"ENG-12\").",
      inputSchema: {
        type: "object",
        properties: {
          taskKey: { type: "string", description: 'The task key, e.g. "ENG-12".' },
          status: {
            type: "string",
            enum: ["open", "in_progress", "done"],
            description: "Target status column.",
          },
        },
        required: ["taskKey", "status"],
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

// Write-tool input schemas. These mirror the task field rules (validators/task)
// so a proposal can never carry values the normal forms would reject. The model
// supplies a human key, never a uuid — we resolve the real row ourselves.
const createTaskToolInput = z.object({
  projectKey: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(10_000).optional(),
  priority: TaskPriorityEnum.optional(),
  type: TaskTypeEnum.optional(),
});
const updateTaskToolInput = z
  .object({
    taskKey: z.string().trim().min(1).max(64),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(10_000).optional(),
    priority: TaskPriorityEnum.optional(),
    status: TaskStatusEnum.optional(),
    points: z.number().int().min(0).max(100).optional(),
  })
  .refine(
    (i) =>
      i.title !== undefined ||
      i.description !== undefined ||
      i.priority !== undefined ||
      i.status !== undefined ||
      i.points !== undefined,
    { message: "at least one field to change" },
  );
const moveTaskToolInput = z.object({
  taskKey: z.string().trim().min(1).max(64),
  status: TaskStatusEnum,
});

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

/** The three write tools — never executed against the model's read dispatcher. */
const WRITE_TOOLS = new Set(["create_task", "update_task", "move_task"]);

/** What `runAssistantTool` hands back to the route for one tool call. */
export interface AssistantToolResult {
  /** The string fed back to the model as this tool's result. */
  forModel: string;
  /** Present only for write tools: emit this to the client as a proposal card. */
  proposal?: AssistantProposal;
}

const PROPOSED =
  "Proposed to the user for confirmation — not yet applied. Tell the user you've prepared it and they can Confirm.";

/**
 * Dispatch one model tool call for the streaming route. `db` is RLS-scoped to
 * `workspaceId` by the caller.
 *
 * READ tools behave exactly as before — `{ forModel: <compact JSON> }`.
 * WRITE tools never mutate: the input is validated, the project/task is
 * resolved by key + workspace to confirm it exists, and a *proposal* is
 * returned for the user to confirm. Validation/resolution failures come back as
 * `{ forModel: <error JSON> }` so the model can recover instead of the stream
 * dying. Ids embedded in the proposal are re-resolved at apply time and are
 * never trusted on their own.
 */
export async function runAssistantTool(
  db: Database,
  workspaceId: string,
  name: string,
  input: unknown,
): Promise<AssistantToolResult> {
  if (!WRITE_TOOLS.has(name)) {
    return { forModel: await executeAssistantTool(db, workspaceId, name, input) };
  }

  switch (name) {
    case "create_task": {
      const parsed = createTaskToolInput.safeParse(input);
      if (!parsed.success) {
        return {
          forModel: toolError(
            "create_task expects { projectKey: string, title: string, description?, priority?, type? }.",
          ),
        };
      }
      const project = await getProjectByKey(db, workspaceId, parsed.data.projectKey);
      if (!project) return { forModel: toolError(`No project with key "${parsed.data.projectKey}".`) };
      // The default list is where new tasks land (createTask needs a listId).
      const [list] = await db
        .select({ id: lists.id })
        .from(lists)
        .where(and(eq(lists.workspaceId, workspaceId), eq(lists.projectId, project.id)))
        .limit(1);
      if (!list) return { forModel: toolError(`Project "${project.key}" has no list to add tasks to.`) };

      const proposal: AssistantProposal = {
        id: crypto.randomUUID(),
        kind: "create_task",
        summary: `Create task "${parsed.data.title}" in ${project.key}${
          parsed.data.priority ? ` (priority: ${parsed.data.priority})` : ""
        }${parsed.data.type ? ` (type: ${parsed.data.type})` : ""}.`,
        projectKey: project.key,
        projectId: project.id,
        listId: list.id,
        title: parsed.data.title,
        ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
        ...(parsed.data.priority !== undefined ? { priority: parsed.data.priority } : {}),
        ...(parsed.data.type !== undefined ? { type: parsed.data.type } : {}),
      };
      return { forModel: PROPOSED, proposal };
    }

    case "update_task": {
      const parsed = updateTaskToolInput.safeParse(input);
      if (!parsed.success) {
        return {
          forModel: toolError(
            "update_task expects { taskKey: string } plus at least one of title, description, priority, status, points.",
          ),
        };
      }
      const task = await resolveTaskByKey(db, workspaceId, parsed.data.taskKey);
      if (!task) return { forModel: toolError(`No task with key "${parsed.data.taskKey}".`) };

      const changes: string[] = [];
      if (parsed.data.title !== undefined) changes.push(`title → "${parsed.data.title}"`);
      if (parsed.data.status !== undefined) changes.push(`status → ${parsed.data.status}`);
      if (parsed.data.priority !== undefined) changes.push(`priority → ${parsed.data.priority}`);
      if (parsed.data.points !== undefined) changes.push(`points → ${parsed.data.points}`);
      if (parsed.data.description !== undefined) changes.push("description");

      const proposal: AssistantProposal = {
        id: crypto.randomUUID(),
        kind: "update_task",
        summary: `Update ${task.key}: ${changes.join(", ")}.`,
        taskKey: task.key,
        taskId: task.id,
        projectId: task.projectId,
        ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
        ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
        ...(parsed.data.priority !== undefined ? { priority: parsed.data.priority } : {}),
        ...(parsed.data.points !== undefined ? { points: parsed.data.points } : {}),
      };
      return { forModel: PROPOSED, proposal };
    }

    case "move_task": {
      const parsed = moveTaskToolInput.safeParse(input);
      if (!parsed.success) {
        return {
          forModel: toolError(
            "move_task expects { taskKey: string, status: open|in_progress|done }.",
          ),
        };
      }
      const task = await resolveTaskByKey(db, workspaceId, parsed.data.taskKey);
      if (!task) return { forModel: toolError(`No task with key "${parsed.data.taskKey}".`) };

      const proposal: AssistantProposal = {
        id: crypto.randomUUID(),
        kind: "move_task",
        summary: `Move ${task.key} from ${task.status} to ${parsed.data.status}.`,
        taskKey: task.key,
        taskId: task.id,
        projectId: task.projectId,
        status: parsed.data.status,
      };
      return { forModel: PROPOSED, proposal };
    }

    default:
      return { forModel: toolError(`Unknown tool "${name}".`) };
  }
}

/**
 * Resolve a task by workspace + human key (e.g. "ENG-12"). Returns the few
 * columns the proposal summary needs. Like every lookup here it is scoped by
 * `workspaceId` and keyed by the human key — never a model-supplied uuid.
 */
async function resolveTaskByKey(db: Database, workspaceId: string, key: string) {
  const [row] = await db
    .select({
      id: tasksTable.id,
      key: tasksTable.key,
      projectId: tasksTable.projectId,
      status: tasksTable.status,
    })
    .from(tasksTable)
    .where(and(eq(tasksTable.workspaceId, workspaceId), eq(tasksTable.key, key)))
    .limit(1);
  return row;
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

function toolError(message: string): string {
  return JSON.stringify({ error: message });
}
