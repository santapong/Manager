"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { tasks as tasksTable } from "@manager/db";
import { moveTask, recordActivity } from "@manager/db/queries";
import { auth } from "@/src/lib/auth";
import { MoveTaskSchema } from "@/src/lib/validators/task";
import { withActiveWorkspace } from "@/src/lib/workspace-context";

/**
 * Commit a drag: the client sends the target status and neighbor ids;
 * the fractional position is computed server-side (queries/tasks.ts).
 * Status changes append a status_changed activity event.
 */
export async function moveTaskAction(
  slug: string,
  projectKey: string,
  input: { id: string; status: "open" | "in_progress" | "done"; beforeId?: string | null; afterId?: string | null },
) {
  const parsed = MoveTaskSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const svc = await auth();
  const session = await svc.requireSession();

  await withActiveWorkspace(async (tx, ws) => {
    const [before] = await tx
      .select({ status: tasksTable.status })
      .from(tasksTable)
      .where(and(eq(tasksTable.workspaceId, ws.id), eq(tasksTable.id, parsed.data.id)))
      .limit(1);
    if (!before) throw new Error("task_not_found");

    const row = await moveTask(tx, {
      id: parsed.data.id,
      workspaceId: ws.id,
      status: parsed.data.status,
      beforeId: parsed.data.beforeId ?? null,
      afterId: parsed.data.afterId ?? null,
    });

    if (before.status !== row.status) {
      await recordActivity(tx, {
        workspaceId: ws.id,
        projectId: row.projectId,
        taskId: row.id,
        actorId: session.user.id,
        type: "status_changed",
        payload: { from: before.status, to: row.status },
      });
    }
  });

  revalidatePath(`/${slug}/projects/${projectKey}`);
  revalidatePath(`/${slug}/projects/${projectKey}/board`);
  return { ok: true as const };
}
