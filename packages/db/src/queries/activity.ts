import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../client";
import { activity, users, type Activity, type ActivityType } from "../schema";

export interface RecordActivityInput {
  workspaceId: string;
  projectId: string;
  taskId: string;
  actorId: string | null;
  type: ActivityType;
  payload?: Record<string, unknown>;
}

/**
 * Append one audit event. Called from server actions and API routes —
 * never from DB triggers, because `actor_id` is application state.
 */
export async function recordActivity(db: Database, input: RecordActivityInput): Promise<Activity> {
  const [row] = await db
    .insert(activity)
    .values({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      taskId: input.taskId,
      actorId: input.actorId,
      type: input.type,
      payload: input.payload ?? {},
    })
    .returning();
  if (!row) throw new Error("activity_insert_failed");
  return row;
}

export interface ActivityEntry {
  id: string;
  type: ActivityType;
  payload: Record<string, unknown>;
  createdAt: Date;
  actor: { id: string; name: string | null; email: string } | null;
}

export async function listActivityForTask(
  db: Database,
  workspaceId: string,
  taskId: string,
  limit = 100,
): Promise<ActivityEntry[]> {
  const rows = await db
    .select({
      id: activity.id,
      type: activity.type,
      payload: activity.payload,
      createdAt: activity.createdAt,
      actorId: users.id,
      actorName: users.name,
      actorEmail: users.email,
    })
    .from(activity)
    .leftJoin(users, eq(activity.actorId, users.id))
    .where(and(eq(activity.workspaceId, workspaceId), eq(activity.taskId, taskId)))
    .orderBy(desc(activity.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    payload: r.payload,
    createdAt: r.createdAt,
    actor: r.actorId ? { id: r.actorId, name: r.actorName, email: r.actorEmail! } : null,
  }));
}
