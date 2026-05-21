"use server";

import { revalidatePath } from "next/cache";
import { withActiveWorkspace } from "@/src/lib/workspace-context";
import * as labels from "@/src/server/labels";
import {
  AttachLabelToProjectSchema,
  AttachLabelToTaskSchema,
  CreateLabelSchema,
  LabelIdSchema,
  UpdateLabelSchema,
} from "@/src/lib/validators/label";

export async function listLabelsAction() {
  const rows = await withActiveWorkspace(async (tx, ws) => labels.list(tx, ws.id));
  return { ok: true as const, labels: rows };
}

export async function createLabelAction(slug: string, _prev: unknown, formData: FormData) {
  const parsed = CreateLabelSchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    const row = await withActiveWorkspace(async (tx, ws) =>
      labels.create(tx, ws.id, parsed.data),
    );
    revalidatePath(`/${slug}`);
    return { ok: true as const, label: row };
  } catch (e) {
    if (e instanceof Error && /unique|duplicate/i.test(e.message)) {
      return { error: `Label "${parsed.data.name}" already exists.` };
    }
    throw e;
  }
}

export async function updateLabelAction(slug: string, formData: FormData) {
  const parsed = UpdateLabelSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name") || undefined,
    color: formData.get("color") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { id, ...patch } = parsed.data;
  const row = await withActiveWorkspace(async (tx, ws) =>
    labels.update(tx, ws.id, id, patch),
  );
  revalidatePath(`/${slug}`);
  if (!row) return { error: "label_not_found" };
  return { ok: true as const, label: row };
}

export async function deleteLabelAction(slug: string, formData: FormData) {
  const parsed = LabelIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  await withActiveWorkspace(async (tx, ws) => labels.remove(tx, ws.id, parsed.data.id));
  revalidatePath(`/${slug}`);
  return { ok: true as const };
}

export async function attachLabelToTaskAction(slug: string, formData: FormData) {
  const parsed = AttachLabelToTaskSchema.safeParse({
    taskId: formData.get("taskId"),
    labelId: formData.get("labelId"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  await withActiveWorkspace(async (tx) =>
    labels.attachToTask(tx, parsed.data.taskId, parsed.data.labelId),
  );
  revalidatePath(`/${slug}`);
  return { ok: true as const };
}

export async function detachLabelFromTaskAction(slug: string, formData: FormData) {
  const parsed = AttachLabelToTaskSchema.safeParse({
    taskId: formData.get("taskId"),
    labelId: formData.get("labelId"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  await withActiveWorkspace(async (tx) =>
    labels.detachFromTask(tx, parsed.data.taskId, parsed.data.labelId),
  );
  revalidatePath(`/${slug}`);
  return { ok: true as const };
}

export async function attachLabelToProjectAction(slug: string, formData: FormData) {
  const parsed = AttachLabelToProjectSchema.safeParse({
    projectId: formData.get("projectId"),
    labelId: formData.get("labelId"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  await withActiveWorkspace(async (tx) =>
    labels.attachToProject(tx, parsed.data.projectId, parsed.data.labelId),
  );
  revalidatePath(`/${slug}`);
  return { ok: true as const };
}

export async function detachLabelFromProjectAction(slug: string, formData: FormData) {
  const parsed = AttachLabelToProjectSchema.safeParse({
    projectId: formData.get("projectId"),
    labelId: formData.get("labelId"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  await withActiveWorkspace(async (tx) =>
    labels.detachFromProject(tx, parsed.data.projectId, parsed.data.labelId),
  );
  revalidatePath(`/${slug}`);
  return { ok: true as const };
}
