import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "../client";
import { comments, memberships, users, type Comment } from "../schema";
import { recordActivity } from "./activity";
import { createNotifications } from "./notifications";

// Canonical mention token inserted by the composer: @[Display Name](uuid)
const MENTION_TOKEN = /@\[[^\]]*\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/giu;

/** Pure parser — extracts unique candidate user-ids from a comment body. */
export function parseMentionTokens(body: string): string[] {
  const ids = new Set<string>();
  for (const match of body.matchAll(MENTION_TOKEN)) {
    ids.add(match[1]!.toLowerCase());
  }
  return Array.from(ids);
}

/** Keep only candidates that are actually members of the workspace. */
export async function resolveMentions(
  db: Database,
  workspaceId: string,
  candidateIds: string[],
): Promise<string[]> {
  if (candidateIds.length === 0) return [];
  const rows = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.workspaceId, workspaceId), inArray(memberships.userId, candidateIds)));
  return rows.map((r) => r.userId);
}

export interface CreateCommentInput {
  workspaceId: string;
  task: { id: string; key: string; title: string; projectId: string };
  authorId: string;
  body: string;
}

/**
 * Insert a comment, fan out `mention` notifications to resolved members
 * (excluding the author), and append a `comment_added` activity event.
 * Run inside a `withWorkspace` transaction so all three commit together.
 */
export async function createComment(
  db: Database,
  input: CreateCommentInput,
): Promise<{ comment: Comment; mentionedUserIds: string[] }> {
  const candidates = parseMentionTokens(input.body);
  const mentions = await resolveMentions(db, input.workspaceId, candidates);
  const notified = mentions.filter((id) => id !== input.authorId);

  const [comment] = await db
    .insert(comments)
    .values({
      workspaceId: input.workspaceId,
      taskId: input.task.id,
      authorId: input.authorId,
      body: input.body,
      mentions,
    })
    .returning();
  if (!comment) throw new Error("comment_insert_failed");

  await createNotifications(
    db,
    notified.map((userId) => ({
      workspaceId: input.workspaceId,
      userId,
      actorId: input.authorId,
      type: "mention" as const,
      taskId: input.task.id,
      commentId: comment.id,
      payload: {
        taskKey: input.task.key,
        taskTitle: input.task.title,
        excerpt: input.body.slice(0, 140),
      },
    })),
  );

  await recordActivity(db, {
    workspaceId: input.workspaceId,
    projectId: input.task.projectId,
    taskId: input.task.id,
    actorId: input.authorId,
    type: "comment_added",
    payload: { commentId: comment.id },
  });

  return { comment, mentionedUserIds: notified };
}

export interface CommentWithAuthor {
  id: string;
  body: string;
  mentions: string[];
  createdAt: Date;
  author: { id: string; name: string | null; email: string } | null;
}

export async function listCommentsForTask(
  db: Database,
  workspaceId: string,
  taskId: string,
): Promise<CommentWithAuthor[]> {
  const rows = await db
    .select({
      id: comments.id,
      body: comments.body,
      mentions: comments.mentions,
      createdAt: comments.createdAt,
      authorId: users.id,
      authorName: users.name,
      authorEmail: users.email,
    })
    .from(comments)
    .leftJoin(users, eq(comments.authorId, users.id))
    .where(and(eq(comments.workspaceId, workspaceId), eq(comments.taskId, taskId)))
    .orderBy(asc(comments.createdAt));

  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    mentions: r.mentions,
    createdAt: r.createdAt,
    author: r.authorId ? { id: r.authorId, name: r.authorName, email: r.authorEmail! } : null,
  }));
}

export async function deleteComment(
  db: Database,
  workspaceId: string,
  id: string,
): Promise<Comment | undefined> {
  const [row] = await db
    .delete(comments)
    .where(and(eq(comments.workspaceId, workspaceId), eq(comments.id, id)))
    .returning();
  return row;
}
