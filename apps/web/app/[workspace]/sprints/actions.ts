"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { tasks as tasksTable } from "@manager/db";
import { moveTask } from "@manager/db/queries";
import { auth } from "@/src/lib/auth";
import { withActiveWorkspace } from "@/src/lib/workspace-context";
import {
  AssignTaskSchema,
  CreateSprintSchema,
  SprintIdSchema,
  UpdateSprintSchema,
} from "@/src/lib/validators/sprint";
import { MoveTaskSchema } from "@/src/lib/validators/task";
import * as sprintsService from "@/src/server/sprints";

function revalidateSprints(slug: string, sprintId?: string) {
  revalidatePath(`/${slug}/sprints`);
  revalidatePath(`/${slug}/sprints/backlog`);
  if (sprintId) revalidatePath(`/${slug}/sprints/${sprintId}`);
}

/** Create a sprint. Bound with the workspace slug; used by useActionState. */
export async function createSprintAction(slug: string, _prev: unknown, formData: FormData) {
  const parsed = CreateSprintSchema.safeParse({
    projectId: formData.get("projectId"),
    name: formData.get("name"),
    goal: formData.get("goal") || null,
    startAt: formData.get("startAt") || null,
    endAt: formData.get("endAt") || null,
    status: formData.get("status") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const session = await (await auth()).requireSession();
  const sprint = await withActiveWorkspace(async (tx, ws) =>
    sprintsService.createSprint(tx, {
      workspaceId: ws.id,
      projectId: parsed.data.projectId,
      name: parsed.data.name,
      goal: parsed.data.goal,
      startAt: parsed.data.startAt,
      endAt: parsed.data.endAt,
      status: parsed.data.status,
      createdBy: session.user.id,
    }),
  );
  revalidateSprints(slug, sprint.id);
  return { ok: true as const, sprintId: sprint.id };
}

export async function updateSprintAction(slug: string, _prev: unknown, formData: FormData) {
  const parsed = UpdateSprintSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name") || undefined,
    goal: formData.get("goal") ?? undefined,
    startAt: formData.get("startAt") ?? undefined,
    endAt: formData.get("endAt") ?? undefined,
    status: formData.get("status") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const { id, ...patch } = parsed.data;
  const row = await withActiveWorkspace(async (tx, ws) =>
    sprintsService.updateSprint(tx, ws.id, id, patch),
  );
  if (!row) return { error: "sprint_not_found" };
  revalidateSprints(slug, id);
  return { ok: true as const };
}

export async function startSprintAction(slug: string, _prev: unknown, formData: FormData) {
  const parsed = SprintIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const row = await withActiveWorkspace(async (tx, ws) =>
    sprintsService.startSprint(tx, ws.id, parsed.data.id),
  );
  if (!row) return { error: "sprint_not_found" };
  revalidateSprints(slug, parsed.data.id);
  return { ok: true as const };
}

export async function finishSprintAction(slug: string, _prev: unknown, formData: FormData) {
  const parsed = SprintIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const row = await withActiveWorkspace(async (tx, ws) =>
    sprintsService.finishSprint(tx, ws.id, parsed.data.id),
  );
  if (!row) return { error: "sprint_not_found" };
  revalidateSprints(slug, parsed.data.id);
  return { ok: true as const };
}

export async function deleteSprintAction(slug: string, _prev: unknown, formData: FormData) {
  const parsed = SprintIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  await withActiveWorkspace(async (tx, ws) => sprintsService.deleteSprint(tx, ws.id, parsed.data.id));
  revalidateSprints(slug);
  return { ok: true as const };
}

/**
 * Assign/unassign a task to a sprint. `sprintId: null` returns it to the
 * backlog. The service verifies the sprint is in the task's project.
 */
export async function assignTaskAction(
  slug: string,
  input: { taskId: string; sprintId: string | null },
) {
  const parsed = AssignTaskSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const result = await withActiveWorkspace(async (tx, ws) =>
    sprintsService.assignTaskToSprint(tx, ws.id, parsed.data.taskId, parsed.data.sprintId),
  );
  if ("error" in result) return result;
  revalidateSprints(slug, parsed.data.sprintId ?? undefined);
  return { ok: true as const };
}

/**
 * Sprint board drag commit. Reuses the project board's fractional-position
 * mover (moveTask only touches status/position/updatedAt — never sprint_id, so
 * a card stays in the sprint) and revalidates the sprint detail page.
 */
export async function moveSprintTaskAction(
  slug: string,
  sprintId: string,
  input: { id: string; status: "open" | "in_progress" | "done"; beforeId?: string | null; afterId?: string | null },
) {
  const parsed = MoveTaskSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  await withActiveWorkspace(async (tx, ws) => {
    const [before] = await tx
      .select({ status: tasksTable.status })
      .from(tasksTable)
      .where(and(eq(tasksTable.workspaceId, ws.id), eq(tasksTable.id, parsed.data.id)))
      .limit(1);
    if (!before) throw new Error("task_not_found");
    await moveTask(tx, {
      id: parsed.data.id,
      workspaceId: ws.id,
      status: parsed.data.status,
      beforeId: parsed.data.beforeId ?? null,
      afterId: parsed.data.afterId ?? null,
    });
  });

  revalidatePath(`/${slug}/sprints/${sprintId}`);
  return { ok: true as const };
}
