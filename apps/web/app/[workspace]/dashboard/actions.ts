"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/src/lib/auth";
import { LayoutSchema, LogPomodoroSchema } from "@/src/lib/validators/dashboard";
import { withActiveWorkspace } from "@/src/lib/workspace-context";
import { saveLayout } from "@/src/server/dashboard";
import { logSession } from "@/src/server/pomodoro";

/**
 * Persist the user's widget order/selection for this workspace. The client
 * sends the full ordered array after each reorder/add/remove.
 */
export async function saveLayoutAction(slug: string, layout: unknown) {
  const parsed = LayoutSchema.safeParse(layout);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid layout" };

  const session = await (await auth()).requireSession();
  const userId = session.user.id;

  await withActiveWorkspace((tx, ws) => saveLayout(tx, ws.id, userId, parsed.data));

  revalidatePath(`/${slug}/dashboard`);
  return { ok: true as const };
}

/**
 * Record a completed Pomodoro interval. Fired (best-effort) by the timer when
 * a focus block finishes so "focus sessions today" stays durable.
 */
export async function logPomodoroAction(slug: string, input: unknown) {
  const parsed = LogPomodoroSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const session = await (await auth()).requireSession();
  const userId = session.user.id;

  await withActiveWorkspace((tx, ws) =>
    logSession(tx, {
      workspaceId: ws.id,
      userId,
      kind: parsed.data.kind,
      minutes: parsed.data.minutes,
      startedAt: parsed.data.startedAt,
      taskId: parsed.data.taskId,
    }),
  );

  revalidatePath(`/${slug}/dashboard`);
  return { ok: true as const };
}
