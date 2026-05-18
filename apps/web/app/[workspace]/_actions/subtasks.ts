"use server";

import { revalidatePath } from "next/cache";
import { withActiveWorkspace } from "@/src/lib/workspace-context";
import * as subtasks from "@/src/server/subtasks";
import {
  CreateSubtaskSchema,
  ListSubtasksSchema,
  ReorderSubtasksSchema,
  SubtaskIdSchema,
  ToggleSubtaskSchema,
  UpdateSubtaskSchema,
} from "@/src/lib/validators/subtask";

export async function listSubtasksAction(input: { taskId: string }) {
  const parsed = ListSubtasksSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const rows = await withActiveWorkspace(async (tx, ws) =>
    subtasks.listForTask(tx, ws.id, parsed.data.taskId),
  );
  return { ok: true as const, subtasks: rows };
}

export async function createSubtaskAction(slug: string, _prev: unknown, formData: FormData) {
  const parsed = CreateSubtaskSchema.safeParse({
    taskId: formData.get("taskId"),
    title: formData.get("title"),
    done: formData.get("done") === "true" || undefined,
    assigneeId: formData.get("assigneeId") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const row = await withActiveWorkspace(async (tx, ws) =>
    subtasks.create(tx, ws.id, parsed.data),
  );
  revalidatePath(`/${slug}`);
  return { ok: true as const, subtask: row };
}

export async function updateSubtaskAction(slug: string, formData: FormData) {
  const parsed = UpdateSubtaskSchema.safeParse({
    id: formData.get("id"),
    title: formData.get("title") || undefined,
    done: formData.get("done") === "true" ? true : formData.get("done") === "false" ? false : undefined,
    assigneeId: formData.get("assigneeId") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { id, ...patch } = parsed.data;
  const row = await withActiveWorkspace(async (tx, ws) =>
    subtasks.update(tx, ws.id, id, patch),
  );
  revalidatePath(`/${slug}`);
  if (!row) return { error: "subtask_not_found" };
  return { ok: true as const, subtask: row };
}

export async function toggleSubtaskAction(slug: string, formData: FormData) {
  const parsed = ToggleSubtaskSchema.safeParse({
    id: formData.get("id"),
    done:
      formData.get("done") === "true"
        ? true
        : formData.get("done") === "false"
          ? false
          : undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const row = await withActiveWorkspace(async (tx, ws) =>
    subtasks.toggleDone(tx, ws.id, parsed.data.id, parsed.data.done),
  );
  revalidatePath(`/${slug}`);
  if (!row) return { error: "subtask_not_found" };
  return { ok: true as const, subtask: row };
}

export async function reorderSubtasksAction(slug: string, input: { taskId: string; orderedIds: string[] }) {
  const parsed = ReorderSubtasksSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  await withActiveWorkspace(async (tx, ws) =>
    subtasks.reorder(tx, ws.id, parsed.data.taskId, parsed.data.orderedIds),
  );
  revalidatePath(`/${slug}`);
  return { ok: true as const };
}

export async function deleteSubtaskAction(slug: string, formData: FormData) {
  const parsed = SubtaskIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  await withActiveWorkspace(async (tx, ws) => subtasks.remove(tx, ws.id, parsed.data.id));
  revalidatePath(`/${slug}`);
  return { ok: true as const };
}
