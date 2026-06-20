import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { projects, sprints, tasks, type Database, type Sprint } from "@manager/db";

/**
 * Sprints service. All callers MUST run inside `withActiveWorkspace` so the
 * `app.workspace_id` GUC is set and RLS scopes every query. Each function takes
 * a `Database` (transactional client) plus a `workspaceId` used for insert
 * defaults and as a belt-and-suspenders WHERE clause.
 *
 * Backlog = tasks with `sprint_id IS NULL`. Burndown uses task `points` and
 * `updatedAt` as a completion proxy — there is no `completedAt` column, same
 * approximation the dashboard makes (server/dashboard.ts).
 */

// active first, then planned, then completed — for the cross-project list.
const STATUS_RANK = sql<number>`case ${sprints.status}
  when 'active' then 0 when 'planned' then 1 else 2 end`;

export interface SprintWithMeta {
  id: string;
  name: string;
  goal: string | null;
  status: Sprint["status"];
  startAt: Date | null;
  endAt: Date | null;
  projectId: string;
  projectKey: string;
  projectName: string;
  taskCount: number;
  totalPoints: number;
  donePoints: number;
}

/** Every sprint in the workspace with its project name + task/points rollups. */
export async function listSprints(db: Database, workspaceId: string): Promise<SprintWithMeta[]> {
  const rows = await db
    .select({
      id: sprints.id,
      name: sprints.name,
      goal: sprints.goal,
      status: sprints.status,
      startAt: sprints.startAt,
      endAt: sprints.endAt,
      projectId: sprints.projectId,
      projectKey: projects.key,
      projectName: projects.name,
      taskCount: sql<number>`count(${tasks.id})::int`,
      totalPoints: sql<number>`coalesce(sum(${tasks.points}), 0)::int`,
      donePoints: sql<number>`coalesce(sum(${tasks.points}) filter (where ${tasks.status} = 'done'), 0)::int`,
    })
    .from(sprints)
    .innerJoin(projects, eq(sprints.projectId, projects.id))
    .leftJoin(tasks, eq(tasks.sprintId, sprints.id))
    .where(eq(sprints.workspaceId, workspaceId))
    .groupBy(sprints.id, projects.key, projects.name)
    .orderBy(STATUS_RANK, sql`${sprints.startAt} asc nulls last`, asc(sprints.createdAt));
  return rows;
}

export interface SprintDetail extends SprintWithMeta {
  createdAt: Date;
  updatedAt: Date;
}

/** A single sprint with its project name and rollups, or undefined. */
export async function getSprint(
  db: Database,
  workspaceId: string,
  id: string,
): Promise<SprintDetail | undefined> {
  const [row] = await db
    .select({
      id: sprints.id,
      name: sprints.name,
      goal: sprints.goal,
      status: sprints.status,
      startAt: sprints.startAt,
      endAt: sprints.endAt,
      projectId: sprints.projectId,
      projectKey: projects.key,
      projectName: projects.name,
      createdAt: sprints.createdAt,
      updatedAt: sprints.updatedAt,
      taskCount: sql<number>`count(${tasks.id})::int`,
      totalPoints: sql<number>`coalesce(sum(${tasks.points}), 0)::int`,
      donePoints: sql<number>`coalesce(sum(${tasks.points}) filter (where ${tasks.status} = 'done'), 0)::int`,
    })
    .from(sprints)
    .innerJoin(projects, eq(sprints.projectId, projects.id))
    .leftJoin(tasks, eq(tasks.sprintId, sprints.id))
    .where(and(eq(sprints.workspaceId, workspaceId), eq(sprints.id, id)))
    .groupBy(sprints.id, projects.key, projects.name)
    .limit(1);
  return row;
}

export interface CreateSprintInput {
  workspaceId: string;
  projectId: string;
  name: string;
  goal?: string | null;
  startAt?: Date | null;
  endAt?: Date | null;
  status?: Sprint["status"];
  createdBy?: string | null;
}

export async function createSprint(db: Database, input: CreateSprintInput): Promise<Sprint> {
  const [row] = await db
    .insert(sprints)
    .values({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      name: input.name,
      goal: input.goal ?? null,
      startAt: input.startAt ?? null,
      endAt: input.endAt ?? null,
      status: input.status ?? "planned",
      createdBy: input.createdBy ?? null,
    })
    .returning();
  if (!row) throw new Error("sprint_insert_failed");
  return row;
}

export type UpdateSprintPatch = Partial<{
  name: string;
  goal: string | null;
  startAt: Date | null;
  endAt: Date | null;
  status: Sprint["status"];
}>;

export async function updateSprint(
  db: Database,
  workspaceId: string,
  id: string,
  patch: UpdateSprintPatch,
): Promise<Sprint | undefined> {
  const [row] = await db
    .update(sprints)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(sprints.workspaceId, workspaceId), eq(sprints.id, id)))
    .returning();
  return row;
}

/** Mark a sprint active. */
export async function startSprint(
  db: Database,
  workspaceId: string,
  id: string,
): Promise<Sprint | undefined> {
  return updateSprint(db, workspaceId, id, { status: "active" });
}

/**
 * Mark a sprint completed and sweep any unfinished work (status != 'done')
 * back to the backlog by clearing its sprint_id. Runs in one transaction so a
 * sprint never ends up "completed" while still owning open tasks.
 */
export async function finishSprint(
  db: Database,
  workspaceId: string,
  id: string,
): Promise<Sprint | undefined> {
  return db.transaction(async (tx) => {
    await tx
      .update(tasks)
      .set({ sprintId: null, updatedAt: new Date() })
      .where(
        and(
          eq(tasks.workspaceId, workspaceId),
          eq(tasks.sprintId, id),
          sql`${tasks.status} <> 'done'`,
        ),
      );
    const [row] = await tx
      .update(sprints)
      .set({ status: "completed", updatedAt: new Date() })
      .where(and(eq(sprints.workspaceId, workspaceId), eq(sprints.id, id)))
      .returning();
    return row;
  });
}

export async function deleteSprint(db: Database, workspaceId: string, id: string): Promise<void> {
  await db.delete(sprints).where(and(eq(sprints.workspaceId, workspaceId), eq(sprints.id, id)));
}

export interface SprintTask {
  id: string;
  key: string;
  title: string;
  status: "open" | "in_progress" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  type: "task" | "story" | "bug" | "epic";
  points: number | null;
  dueAt: Date | null;
  assigneeId: string | null;
  position: number;
}

/** All tasks assigned to a sprint, ordered by board position. */
export async function listSprintTasks(
  db: Database,
  workspaceId: string,
  sprintId: string,
): Promise<SprintTask[]> {
  return db
    .select({
      id: tasks.id,
      key: tasks.key,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      type: tasks.type,
      points: tasks.points,
      dueAt: tasks.dueAt,
      assigneeId: tasks.assigneeId,
      position: tasks.position,
    })
    .from(tasks)
    .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.sprintId, sprintId)))
    .orderBy(asc(tasks.position), asc(tasks.createdAt));
}

export interface BacklogTask extends SprintTask {
  projectId: string;
  projectKey: string;
  projectName: string;
}

/** Backlog = tasks with no sprint. Optionally narrowed to one project. */
export async function listBacklog(
  db: Database,
  workspaceId: string,
  projectId?: string,
): Promise<BacklogTask[]> {
  const conditions = [eq(tasks.workspaceId, workspaceId), isNull(tasks.sprintId)];
  if (projectId) conditions.push(eq(tasks.projectId, projectId));
  return db
    .select({
      id: tasks.id,
      key: tasks.key,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      type: tasks.type,
      points: tasks.points,
      dueAt: tasks.dueAt,
      assigneeId: tasks.assigneeId,
      position: tasks.position,
      projectId: tasks.projectId,
      projectKey: projects.key,
      projectName: projects.name,
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(and(...conditions))
    .orderBy(asc(projects.key), desc(tasks.updatedAt));
}

/**
 * Assign a task to a sprint (or null to send it to the backlog). When a sprint
 * id is given we verify it belongs to the same project as the task, so cards
 * can't leak across projects via a forged id.
 */
export async function assignTaskToSprint(
  db: Database,
  workspaceId: string,
  taskId: string,
  sprintId: string | null,
): Promise<{ ok: true } | { error: string }> {
  const [task] = await db
    .select({ id: tasks.id, projectId: tasks.projectId })
    .from(tasks)
    .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, taskId)))
    .limit(1);
  if (!task) return { error: "task_not_found" };

  if (sprintId) {
    const [sprint] = await db
      .select({ id: sprints.id, projectId: sprints.projectId })
      .from(sprints)
      .where(and(eq(sprints.workspaceId, workspaceId), eq(sprints.id, sprintId)))
      .limit(1);
    if (!sprint) return { error: "sprint_not_found" };
    if (sprint.projectId !== task.projectId) return { error: "sprint_project_mismatch" };
  }

  await db
    .update(tasks)
    .set({ sprintId, updatedAt: new Date() })
    .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, taskId)));
  return { ok: true };
}

/** Active + planned sprints for a project — the choices a backlog row can move into. */
export async function listAssignableSprints(
  db: Database,
  workspaceId: string,
  projectId: string,
): Promise<Pick<Sprint, "id" | "name" | "status">[]> {
  return db
    .select({ id: sprints.id, name: sprints.name, status: sprints.status })
    .from(sprints)
    .where(
      and(
        eq(sprints.workspaceId, workspaceId),
        eq(sprints.projectId, projectId),
        sql`${sprints.status} in ('active', 'planned')`,
      ),
    )
    .orderBy(STATUS_RANK, asc(sprints.createdAt));
}

export interface Burndown {
  totalPoints: number;
  /** start/end of the modeled window as YYYY-MM-DD, or null when undated. */
  start: string | null;
  end: string | null;
  byDay: { day: string; remainingPoints: number }[];
}

const MS_PER_DAY = 86_400_000;
const MAX_DAYS = 90; // guard against absurd ranges

/**
 * Ideal-vs-actual burndown input for a sprint. `remainingPoints` per day =
 * totalPoints minus the points of tasks marked done on or before that day,
 * using `updatedAt` as the completion proxy (no completedAt column — same
 * approximation as the dashboard's completion chart). Tasks without points
 * contribute 0. The window spans the sprint's start..end dates (inclusive);
 * if either bound is missing we return totals with an empty series so the UI
 * can render a graceful empty state instead of guessing a range.
 */
export async function sprintBurndown(
  db: Database,
  workspaceId: string,
  sprintId: string,
): Promise<Burndown> {
  const rows = await db
    .select({
      points: tasks.points,
      status: tasks.status,
      updatedAt: tasks.updatedAt,
    })
    .from(tasks)
    .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.sprintId, sprintId)));

  const totalPoints = rows.reduce((sum, r) => sum + (r.points ?? 0), 0);

  const [sprint] = await db
    .select({ startAt: sprints.startAt, endAt: sprints.endAt })
    .from(sprints)
    .where(and(eq(sprints.workspaceId, workspaceId), eq(sprints.id, sprintId)))
    .limit(1);

  if (!sprint?.startAt || !sprint?.endAt) {
    return { totalPoints, start: null, end: null, byDay: [] };
  }

  const startKey = sprint.startAt.toISOString().slice(0, 10);
  const endKey = sprint.endAt.toISOString().slice(0, 10);
  const startMs = Date.parse(`${startKey}T00:00:00.000Z`);
  const endMs = Date.parse(`${endKey}T00:00:00.000Z`);
  const days = Math.min(MAX_DAYS, Math.max(1, Math.floor((endMs - startMs) / MS_PER_DAY) + 1));

  // Points completed on each calendar day (done tasks bucketed by updatedAt).
  const completedByDay = new Map<string, number>();
  for (const r of rows) {
    if (r.status !== "done") continue;
    const key = r.updatedAt.toISOString().slice(0, 10);
    completedByDay.set(key, (completedByDay.get(key) ?? 0) + (r.points ?? 0));
  }

  const byDay: { day: string; remainingPoints: number }[] = [];
  let cumulativeDone = 0;
  for (let i = 0; i < days; i++) {
    const dayKey = new Date(startMs + i * MS_PER_DAY).toISOString().slice(0, 10);
    cumulativeDone += completedByDay.get(dayKey) ?? 0;
    byDay.push({ day: dayKey, remainingPoints: Math.max(0, totalPoints - cumulativeDone) });
  }

  return { totalPoints, start: startKey, end: endKey, byDay };
}
