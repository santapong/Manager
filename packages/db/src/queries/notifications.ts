import { and, count, desc, eq, isNull } from "drizzle-orm";
import type { Database } from "../client";
import {
  notifications,
  projects,
  tasks,
  users,
  type NewNotification,
  type NotificationType,
} from "../schema";

/** Bulk insert; silently no-ops on an empty list. */
export async function createNotifications(db: Database, rows: NewNotification[]): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(notifications).values(rows);
}

export interface InboxItem {
  id: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  readAt: Date | null;
  createdAt: Date;
  actor: { name: string | null; email: string } | null;
  task: { id: string; key: string; title: string; projectKey: string } | null;
}

export async function listNotificationsForUser(
  db: Database,
  args: { workspaceId: string; userId: string; unreadOnly?: boolean; limit?: number },
): Promise<InboxItem[]> {
  const conditions = [
    eq(notifications.workspaceId, args.workspaceId),
    eq(notifications.userId, args.userId),
  ];
  if (args.unreadOnly) conditions.push(isNull(notifications.readAt));

  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      payload: notifications.payload,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      actorName: users.name,
      actorEmail: users.email,
      taskId: tasks.id,
      taskKey: tasks.key,
      taskTitle: tasks.title,
      projectKey: projects.key,
    })
    .from(notifications)
    .leftJoin(users, eq(notifications.actorId, users.id))
    .leftJoin(tasks, eq(notifications.taskId, tasks.id))
    .leftJoin(projects, eq(tasks.projectId, projects.id))
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt))
    .limit(args.limit ?? 100);

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    payload: r.payload,
    readAt: r.readAt,
    createdAt: r.createdAt,
    actor: r.actorEmail ? { name: r.actorName, email: r.actorEmail } : null,
    task:
      r.taskId && r.taskKey && r.projectKey
        ? { id: r.taskId, key: r.taskKey, title: r.taskTitle ?? "", projectKey: r.projectKey }
        : null,
  }));
}

export async function countUnread(
  db: Database,
  args: { workspaceId: string; userId: string },
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.workspaceId, args.workspaceId),
        eq(notifications.userId, args.userId),
        isNull(notifications.readAt),
      ),
    );
  return row?.n ?? 0;
}

/** Scoped to the recipient — a user can only mark their own rows. */
export async function markRead(
  db: Database,
  args: { workspaceId: string; userId: string; id: string },
): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, args.id),
        eq(notifications.workspaceId, args.workspaceId),
        eq(notifications.userId, args.userId),
        isNull(notifications.readAt),
      ),
    );
}

export async function markAllRead(
  db: Database,
  args: { workspaceId: string; userId: string },
): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.workspaceId, args.workspaceId),
        eq(notifications.userId, args.userId),
        isNull(notifications.readAt),
      ),
    );
}
