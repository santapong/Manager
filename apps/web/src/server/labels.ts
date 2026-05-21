import { and, asc, eq, sql } from "drizzle-orm";
import {
  labels,
  projectLabels,
  taskLabels,
  type Database,
  type Label,
} from "@manager/db";

/**
 * Labels service. Workspace-scoped, free-form per decisions §4.
 * Always called inside `withActiveWorkspace`.
 */

export async function list(db: Database, workspaceId: string): Promise<Label[]> {
  return db
    .select()
    .from(labels)
    .where(eq(labels.workspaceId, workspaceId))
    .orderBy(asc(labels.name));
}

export async function getByName(
  db: Database,
  workspaceId: string,
  name: string,
): Promise<Label | undefined> {
  const [row] = await db
    .select()
    .from(labels)
    .where(and(eq(labels.workspaceId, workspaceId), sql`lower(${labels.name}) = lower(${name})`))
    .limit(1);
  return row;
}

export interface CreateLabelInput {
  name: string;
  color?: string;
}

export async function create(
  db: Database,
  workspaceId: string,
  input: CreateLabelInput,
): Promise<Label> {
  const [row] = await db
    .insert(labels)
    .values({
      workspaceId,
      name: input.name,
      color: input.color ?? "#888888",
    })
    .returning();
  if (!row) throw new Error("label_insert_failed");
  return row;
}

/**
 * Create the label if it doesn't exist (case-insensitive match on name),
 * otherwise return the existing one. Used by the importer.
 */
export async function getOrCreate(
  db: Database,
  workspaceId: string,
  name: string,
  color?: string,
): Promise<Label> {
  const existing = await getByName(db, workspaceId, name);
  if (existing) return existing;
  return create(db, workspaceId, { name, color });
}

export async function update(
  db: Database,
  workspaceId: string,
  id: string,
  patch: Partial<{ name: string; color: string }>,
): Promise<Label | undefined> {
  const [row] = await db
    .update(labels)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(labels.workspaceId, workspaceId), eq(labels.id, id)))
    .returning();
  return row;
}

export async function remove(db: Database, workspaceId: string, id: string): Promise<void> {
  await db
    .delete(labels)
    .where(and(eq(labels.workspaceId, workspaceId), eq(labels.id, id)));
}

export async function attachToTask(
  db: Database,
  taskId: string,
  labelId: string,
): Promise<void> {
  await db
    .insert(taskLabels)
    .values({ taskId, labelId })
    .onConflictDoNothing();
}

export async function detachFromTask(
  db: Database,
  taskId: string,
  labelId: string,
): Promise<void> {
  await db
    .delete(taskLabels)
    .where(and(eq(taskLabels.taskId, taskId), eq(taskLabels.labelId, labelId)));
}

export async function listForTask(db: Database, taskId: string): Promise<Label[]> {
  return db
    .select({
      id: labels.id,
      workspaceId: labels.workspaceId,
      name: labels.name,
      color: labels.color,
      createdAt: labels.createdAt,
      updatedAt: labels.updatedAt,
    })
    .from(taskLabels)
    .innerJoin(labels, eq(labels.id, taskLabels.labelId))
    .where(eq(taskLabels.taskId, taskId))
    .orderBy(asc(labels.name));
}

export async function attachToProject(
  db: Database,
  projectId: string,
  labelId: string,
): Promise<void> {
  await db
    .insert(projectLabels)
    .values({ projectId, labelId })
    .onConflictDoNothing();
}

export async function detachFromProject(
  db: Database,
  projectId: string,
  labelId: string,
): Promise<void> {
  await db
    .delete(projectLabels)
    .where(and(eq(projectLabels.projectId, projectId), eq(projectLabels.labelId, labelId)));
}

export async function listForProject(db: Database, projectId: string): Promise<Label[]> {
  return db
    .select({
      id: labels.id,
      workspaceId: labels.workspaceId,
      name: labels.name,
      color: labels.color,
      createdAt: labels.createdAt,
      updatedAt: labels.updatedAt,
    })
    .from(projectLabels)
    .innerJoin(labels, eq(labels.id, projectLabels.labelId))
    .where(eq(projectLabels.projectId, projectId))
    .orderBy(asc(labels.name));
}
