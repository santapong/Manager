import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { subtasks, type Database, type Subtask } from "@manager/db";

/**
 * Subtasks service. Always called inside `withActiveWorkspace`.
 */

export async function listForTask(
  db: Database,
  workspaceId: string,
  taskId: string,
): Promise<Subtask[]> {
  return db
    .select()
    .from(subtasks)
    .where(and(eq(subtasks.workspaceId, workspaceId), eq(subtasks.taskId, taskId)))
    .orderBy(asc(subtasks.position), asc(subtasks.createdAt));
}

export interface CreateSubtaskInput {
  taskId: string;
  title: string;
  done?: boolean;
  assigneeId?: string | null;
  position?: number;
}

export async function create(
  db: Database,
  workspaceId: string,
  input: CreateSubtaskInput,
): Promise<Subtask> {
  let position = input.position;
  if (position === undefined) {
    // Append at end.
    const rows = await db
      .select({
        next: sql<number>`coalesce(max(${subtasks.position}), -1) + 1`,
      })
      .from(subtasks)
      .where(and(eq(subtasks.workspaceId, workspaceId), eq(subtasks.taskId, input.taskId)));
    position = rows[0]?.next ?? 0;
  }
  const [row] = await db
    .insert(subtasks)
    .values({
      workspaceId,
      taskId: input.taskId,
      title: input.title,
      done: input.done ?? false,
      assigneeId: input.assigneeId ?? null,
      position,
    })
    .returning();
  if (!row) throw new Error("subtask_insert_failed");
  return row;
}

export type UpdateSubtaskPatch = Partial<{
  title: string;
  done: boolean;
  assigneeId: string | null;
  position: number;
}>;

export async function update(
  db: Database,
  workspaceId: string,
  id: string,
  patch: UpdateSubtaskPatch,
): Promise<Subtask | undefined> {
  const [row] = await db
    .update(subtasks)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(subtasks.workspaceId, workspaceId), eq(subtasks.id, id)))
    .returning();
  return row;
}

export async function toggleDone(
  db: Database,
  workspaceId: string,
  id: string,
  done?: boolean,
): Promise<Subtask | undefined> {
  // If `done` is given, use it. Otherwise flip current state.
  if (done !== undefined) return update(db, workspaceId, id, { done });
  const [current] = await db
    .select({ done: subtasks.done })
    .from(subtasks)
    .where(and(eq(subtasks.workspaceId, workspaceId), eq(subtasks.id, id)))
    .limit(1);
  if (!current) return undefined;
  return update(db, workspaceId, id, { done: !current.done });
}

export async function reorder(
  db: Database,
  workspaceId: string,
  taskId: string,
  orderedIds: string[],
): Promise<void> {
  if (orderedIds.length === 0) return;
  // Validate every id belongs to this task + workspace, otherwise abort.
  const rows = await db
    .select({ id: subtasks.id })
    .from(subtasks)
    .where(
      and(
        eq(subtasks.workspaceId, workspaceId),
        eq(subtasks.taskId, taskId),
        inArray(subtasks.id, orderedIds),
      ),
    );
  if (rows.length !== orderedIds.length) {
    throw new Error("subtask_reorder_ids_mismatch");
  }
  // Apply positions.
  for (let i = 0; i < orderedIds.length; i++) {
    await db
      .update(subtasks)
      .set({ position: i, updatedAt: new Date() })
      .where(
        and(
          eq(subtasks.workspaceId, workspaceId),
          eq(subtasks.id, orderedIds[i]!),
        ),
      );
  }
}

export async function remove(db: Database, workspaceId: string, id: string): Promise<void> {
  await db
    .delete(subtasks)
    .where(and(eq(subtasks.workspaceId, workspaceId), eq(subtasks.id, id)));
}
