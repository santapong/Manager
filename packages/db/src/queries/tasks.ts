import { and, asc, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { Database } from "../client";
import { projects, tasks, type NewTask, type Task } from "../schema";

export interface ListTasksOptions {
  status?: Task["status"];
  priority?: Task["priority"];
  type?: Task["type"];
  /** A user id, or "none" for unassigned. */
  assignee?: string;
  sort?: "position" | "due" | "priority" | "points" | "updated";
  dir?: "asc" | "desc";
}

// urgent > high > medium > low for the priority sort.
const PRIORITY_RANK = sql<number>`case ${tasks.priority}
  when 'urgent' then 4 when 'high' then 3 when 'medium' then 2 else 1 end`;

export async function listTasks(db: Database, projectId: string, opts: ListTasksOptions = {}) {
  const conditions: SQL[] = [eq(tasks.projectId, projectId)];
  if (opts.status) conditions.push(eq(tasks.status, opts.status));
  if (opts.priority) conditions.push(eq(tasks.priority, opts.priority));
  if (opts.type) conditions.push(eq(tasks.type, opts.type));
  if (opts.assignee === "none") conditions.push(isNull(tasks.assigneeId));
  else if (opts.assignee) conditions.push(eq(tasks.assigneeId, opts.assignee));

  const dir = opts.dir === "desc" ? desc : asc;
  const order =
    opts.sort === "due"
      ? // nulls last regardless of direction — undated tasks sink.
        [sql`${tasks.dueAt} ${sql.raw(opts.dir === "desc" ? "desc" : "asc")} nulls last`]
      : opts.sort === "priority"
        ? [opts.dir === "asc" ? asc(PRIORITY_RANK) : desc(PRIORITY_RANK)]
        : opts.sort === "points"
          ? [sql`${tasks.points} ${sql.raw(opts.dir === "desc" ? "desc" : "asc")} nulls last`]
          : opts.sort === "updated"
            ? [dir(tasks.updatedAt)]
            : [asc(tasks.position), asc(tasks.createdAt)];

  return db
    .select()
    .from(tasks)
    .where(and(...conditions))
    .orderBy(...order);
}

export async function getTask(db: Database, id: string): Promise<Task | undefined> {
  const [row] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  return row;
}

export async function createTask(
  db: Database,
  input: Omit<NewTask, "key" | "id" | "createdAt" | "updatedAt" | "position">,
): Promise<Task> {
  return db.transaction(async (tx) => {
    const [project] = await tx
      .select({ key: projects.key, nextTaskSeq: projects.nextTaskSeq })
      .from(projects)
      .where(eq(projects.id, input.projectId))
      .for("update")
      .limit(1);
    if (!project) throw new Error("Project not found or RLS-hidden");
    const seq = project.nextTaskSeq;
    await tx
      .update(projects)
      .set({ nextTaskSeq: seq + 1, updatedAt: new Date() })
      .where(eq(projects.id, input.projectId));
    const key = `${project.key}-${seq}`;
    const [row] = await tx
      .insert(tasks)
      .values({ ...input, key, position: seq })
      .returning();
    if (!row) throw new Error("Insert failed");
    return row;
  });
}

export async function updateTask(
  db: Database,
  id: string,
  patch: Partial<
    Pick<
      Task,
      | "title"
      | "description"
      | "status"
      | "priority"
      | "type"
      | "assigneeId"
      | "dueAt"
      | "points"
      | "milestoneId"
    >
  >,
) {
  const [row] = await db
    .update(tasks)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(tasks.id, id))
    .returning();
  return row;
}

export async function deleteTask(db: Database, id: string) {
  await db.delete(tasks).where(eq(tasks.id, id));
}

export interface MoveTaskInput {
  id: string;
  workspaceId: string;
  status: Task["status"];
  /** Neighbor that ends up immediately ABOVE the card (smaller position). */
  beforeId?: string | null;
  /** Neighbor that ends up immediately BELOW the card (larger position). */
  afterId?: string | null;
}

const POSITION_STEP = 1024;
const MIN_GAP = 1e-6;

/**
 * Move a task to a status column at a fractional position computed
 * server-side from its neighbors (never trust client floats). When the
 * midpoint gap is exhausted, the whole column is renumbered first, in
 * the same transaction.
 */
export async function moveTask(db: Database, input: MoveTaskInput): Promise<Task> {
  return db.transaction(async (tx) => {
    const loadNeighbor = async (id: string) => {
      const [row] = await tx
        .select({ id: tasks.id, position: tasks.position, projectId: tasks.projectId })
        .from(tasks)
        .where(and(eq(tasks.workspaceId, input.workspaceId), eq(tasks.id, id)))
        .limit(1);
      return row;
    };

    const [self] = await tx
      .select({ id: tasks.id, projectId: tasks.projectId })
      .from(tasks)
      .where(and(eq(tasks.workspaceId, input.workspaceId), eq(tasks.id, input.id)))
      .limit(1);
    if (!self) throw new Error("task_not_found");

    let before = input.beforeId ? await loadNeighbor(input.beforeId) : undefined;
    let after = input.afterId ? await loadNeighbor(input.afterId) : undefined;

    if (before && after && after.position - before.position < MIN_GAP) {
      // Same tx-as-Database cast as withWorkspace (rls.ts).
      await rebalanceStatusColumn(tx as unknown as Database, self.projectId, input.status);
      before = await loadNeighbor(before.id);
      after = await loadNeighbor(after.id);
    }

    const position =
      before && after
        ? (before.position + after.position) / 2
        : before
          ? before.position + POSITION_STEP
          : after
            ? after.position - POSITION_STEP
            : POSITION_STEP;

    const [row] = await tx
      .update(tasks)
      .set({ status: input.status, position, updatedAt: new Date() })
      .where(and(eq(tasks.workspaceId, input.workspaceId), eq(tasks.id, input.id)))
      .returning();
    if (!row) throw new Error("move_failed");
    return row;
  });
}

/** Renumber a status column 1024, 2048, … preserving the current order. */
export async function rebalanceStatusColumn(
  db: Database,
  projectId: string,
  status: Task["status"],
): Promise<void> {
  await db.execute(sql`
    with ranked as (
      select id, row_number() over (order by position, created_at) as rn
      from ${tasks}
      where project_id = ${projectId} and status = ${status}
    )
    update ${tasks} t
    set position = ranked.rn * ${POSITION_STEP}
    from ranked
    where t.id = ranked.id
  `);
}

export async function countByStatus(db: Database, projectId: string) {
  return db
    .select({ status: tasks.status, count: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId)))
    .groupBy(tasks.status);
}
