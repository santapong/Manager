"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { logger } from "@manager/observability";
import { comments as commentsTable, tasks as tasksTable, users } from "@manager/db";
import { createComment, deleteComment } from "@manager/db/queries";
import { mentionEmail } from "@manager/email";
import { auth } from "@/src/lib/auth";
import { emailService } from "@/src/lib/email";
import { env } from "@/src/env";
import { CreateCommentSchema, DeleteCommentSchema } from "@/src/lib/validators/comment";
import { withActiveWorkspace } from "@/src/lib/workspace-context";

/**
 * Post a comment. Mention notifications are inserted in the same workspace
 * transaction as the comment (see queries/comments.ts); mention emails go
 * out best-effort AFTER commit — a mail outage must never fail the comment.
 */
export async function createCommentAction(
  slug: string,
  projectKey: string,
  input: { taskId: string; body: string },
) {
  const parsed = CreateCommentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const svc = await auth();
  const session = await svc.requireSession();

  const result = await withActiveWorkspace(async (tx, ws) => {
    const [task] = await tx
      .select({
        id: tasksTable.id,
        key: tasksTable.key,
        title: tasksTable.title,
        projectId: tasksTable.projectId,
      })
      .from(tasksTable)
      .where(and(eq(tasksTable.workspaceId, ws.id), eq(tasksTable.id, parsed.data.taskId)))
      .limit(1);
    if (!task) return { error: "task_not_found" as const };

    const { comment, mentionedUserIds } = await createComment(tx, {
      workspaceId: ws.id,
      task,
      authorId: session.user.id,
      body: parsed.data.body,
    });

    const recipients =
      mentionedUserIds.length === 0
        ? []
        : await tx
            .select({ email: users.email })
            .from(users)
            .where(inArray(users.id, mentionedUserIds));

    return { ok: true as const, comment, task, recipients: recipients.map((r) => r.email) };
  });

  if ("error" in result) return { error: result.error };

  if (result.recipients.length > 0) {
    const url = `${env.NEXT_PUBLIC_APP_URL}/${slug}/projects/${projectKey}?task=${result.task.id}`;
    const { text, html } = mentionEmail({
      actorName: session.user.name ?? session.user.email,
      taskKey: result.task.key,
      taskTitle: result.task.title,
      excerpt: parsed.data.body.slice(0, 140),
      url,
    });
    try {
      const mailer = emailService();
      await Promise.all(
        result.recipients.map((to) =>
          mailer.send({
            to,
            subject: `${result.task.key}: you were mentioned`,
            text,
            html,
            tags: { kind: "mention" },
          }),
        ),
      );
    } catch (e) {
      logger.error("mention_email_failed", {
        taskId: result.task.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  revalidatePath(`/${slug}/projects/${projectKey}`);
  return { ok: true as const };
}

/** Author may delete their own comment; owners/admins may delete any. */
export async function deleteCommentAction(slug: string, projectKey: string, input: { id: string }) {
  const parsed = DeleteCommentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const svc = await auth();
  const session = await svc.requireSession();

  const result = await withActiveWorkspace(async (tx, ws) => {
    const [row] = await tx
      .select({ authorId: commentsTable.authorId })
      .from(commentsTable)
      .where(and(eq(commentsTable.workspaceId, ws.id), eq(commentsTable.id, parsed.data.id)))
      .limit(1);
    if (!row) return { error: "comment_not_found" as const };
    const canDelete =
      row.authorId === session.user.id || ws.role === "owner" || ws.role === "admin";
    if (!canDelete) return { error: "Only the author or an admin can delete a comment." };
    await deleteComment(tx, ws.id, parsed.data.id);
    return { ok: true as const };
  });

  if ("error" in result) return { error: result.error };
  revalidatePath(`/${slug}/projects/${projectKey}`);
  return { ok: true as const };
}
