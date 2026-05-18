"use server";

import { revalidatePath } from "next/cache";
import { withActiveWorkspace } from "@/src/lib/workspace-context";
import * as milestones from "@/src/server/milestones";
import {
  CreateMilestoneSchema,
  ListMilestonesSchema,
  MilestoneIdSchema,
  SetMilestoneStatusSchema,
  UpdateMilestoneSchema,
} from "@/src/lib/validators/milestone";

export async function listMilestonesAction(input: { projectId: string }) {
  const parsed = ListMilestonesSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const rows = await withActiveWorkspace(async (tx, ws) =>
    milestones.list(tx, ws.id, parsed.data.projectId),
  );
  return { ok: true as const, milestones: rows };
}

export async function getMilestoneAction(input: { id: string }) {
  const parsed = MilestoneIdSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const row = await withActiveWorkspace(async (tx, ws) =>
    milestones.get(tx, ws.id, parsed.data.id),
  );
  if (!row) return { error: "milestone_not_found" };
  return { ok: true as const, milestone: row };
}

export async function createMilestoneAction(
  slug: string,
  _prev: unknown,
  formData: FormData,
) {
  const parsed = CreateMilestoneSchema.safeParse({
    projectId: formData.get("projectId"),
    name: formData.get("name"),
    description: formData.get("description") || null,
    targetDate: formData.get("targetDate") || null,
    status: formData.get("status") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const row = await withActiveWorkspace(async (tx, ws) =>
    milestones.create(tx, ws.id, parsed.data),
  );
  revalidatePath(`/${slug}`);
  return { ok: true as const, milestone: row };
}

export async function updateMilestoneAction(slug: string, formData: FormData) {
  const parsed = UpdateMilestoneSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name") || undefined,
    description: formData.get("description") ?? undefined,
    targetDate: formData.get("targetDate") ?? undefined,
    status: formData.get("status") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { id, ...patch } = parsed.data;
  const row = await withActiveWorkspace(async (tx, ws) =>
    milestones.update(tx, ws.id, id, patch),
  );
  revalidatePath(`/${slug}`);
  if (!row) return { error: "milestone_not_found" };
  return { ok: true as const, milestone: row };
}

export async function setMilestoneStatusAction(slug: string, formData: FormData) {
  const parsed = SetMilestoneStatusSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const row = await withActiveWorkspace(async (tx, ws) =>
    milestones.setStatus(tx, ws.id, parsed.data.id, parsed.data.status),
  );
  revalidatePath(`/${slug}`);
  if (!row) return { error: "milestone_not_found" };
  return { ok: true as const, milestone: row };
}

export async function getMilestoneProgressAction(input: { id: string }) {
  const parsed = MilestoneIdSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const progress = await withActiveWorkspace(async (tx, ws) =>
    milestones.progress(tx, ws.id, parsed.data.id),
  );
  return { ok: true as const, progress };
}

export async function deleteMilestoneAction(slug: string, formData: FormData) {
  const parsed = MilestoneIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  await withActiveWorkspace(async (tx, ws) => milestones.remove(tx, ws.id, parsed.data.id));
  revalidatePath(`/${slug}`);
  return { ok: true as const };
}
