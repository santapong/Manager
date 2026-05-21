import { and, asc, eq, sql } from "drizzle-orm";
import {
  milestones,
  tasks,
  type Database,
  type Milestone,
} from "@manager/db";

/**
 * Milestones service. All callers MUST run inside `withActiveWorkspace`
 * so the `app.workspace_id` GUC is set and RLS scopes every query.
 *
 * Each function takes a `Database` (transactional client) plus a `workspaceId`
 * that's used for `insert` defaults and as a belt-and-suspenders WHERE clause.
 */

export async function list(
  db: Database,
  workspaceId: string,
  projectId: string,
): Promise<Milestone[]> {
  return db
    .select()
    .from(milestones)
    .where(and(eq(milestones.workspaceId, workspaceId), eq(milestones.projectId, projectId)))
    .orderBy(asc(milestones.position), asc(milestones.createdAt));
}

export async function get(
  db: Database,
  workspaceId: string,
  id: string,
): Promise<Milestone | undefined> {
  const [row] = await db
    .select()
    .from(milestones)
    .where(and(eq(milestones.workspaceId, workspaceId), eq(milestones.id, id)))
    .limit(1);
  return row;
}

export interface CreateMilestoneInput {
  projectId: string;
  name: string;
  description?: string | null;
  targetDate?: string | null;
  status?: "open" | "closed";
  position?: number;
}

export async function create(
  db: Database,
  workspaceId: string,
  input: CreateMilestoneInput,
): Promise<Milestone> {
  const [row] = await db
    .insert(milestones)
    .values({
      workspaceId,
      projectId: input.projectId,
      name: input.name,
      description: input.description ?? null,
      targetDate: input.targetDate ?? null,
      status: input.status ?? "open",
      position: input.position ?? 0,
    })
    .returning();
  if (!row) throw new Error("milestone_insert_failed");
  return row;
}

export type UpdateMilestonePatch = Partial<{
  name: string;
  description: string | null;
  targetDate: string | null;
  status: "open" | "closed";
  position: number;
}>;

export async function update(
  db: Database,
  workspaceId: string,
  id: string,
  patch: UpdateMilestonePatch,
): Promise<Milestone | undefined> {
  const [row] = await db
    .update(milestones)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(milestones.workspaceId, workspaceId), eq(milestones.id, id)))
    .returning();
  return row;
}

export async function setStatus(
  db: Database,
  workspaceId: string,
  id: string,
  status: "open" | "closed",
): Promise<Milestone | undefined> {
  return update(db, workspaceId, id, { status });
}

export interface MilestoneProgress {
  milestoneId: string;
  open: number;
  inProgress: number;
  done: number;
  total: number;
}

export async function progress(
  db: Database,
  workspaceId: string,
  id: string,
): Promise<MilestoneProgress> {
  const rows = await db
    .select({ status: tasks.status, count: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.milestoneId, id)))
    .groupBy(tasks.status);

  let open = 0;
  let inProgress = 0;
  let done = 0;
  for (const r of rows) {
    if (r.status === "open") open += r.count;
    else if (r.status === "in_progress") inProgress += r.count;
    else if (r.status === "done") done += r.count;
  }
  return { milestoneId: id, open, inProgress, done, total: open + inProgress + done };
}

export async function remove(
  db: Database,
  workspaceId: string,
  id: string,
): Promise<void> {
  await db
    .delete(milestones)
    .where(and(eq(milestones.workspaceId, workspaceId), eq(milestones.id, id)));
}
