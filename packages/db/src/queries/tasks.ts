import { and, asc, eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import { projects, tasks, type NewTask, type Task } from "../schema";

export async function listTasks(db: Database, projectId: string) {
  return db
    .select()
    .from(tasks)
    .where(eq(tasks.projectId, projectId))
    .orderBy(asc(tasks.position), asc(tasks.createdAt));
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

export async function countByStatus(db: Database, projectId: string) {
  return db
    .select({ status: tasks.status, count: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId)))
    .groupBy(tasks.status);
}
