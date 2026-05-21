"use server";

import { revalidatePath } from "next/cache";
import { withActiveWorkspace } from "@/src/lib/workspace-context";
import * as links from "@/src/server/links";
import {
  CreateProjectLinkSchema,
  CreateTaskLinkSchema,
  DeleteLinkSchema,
  ListProjectLinksSchema,
  ListTaskLinksSchema,
} from "@/src/lib/validators/link";

export async function listTaskLinksAction(input: { taskId: string }) {
  const parsed = ListTaskLinksSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const rows = await withActiveWorkspace(async (tx, ws) =>
    links.listTaskLinks(tx, ws.id, parsed.data.taskId),
  );
  return { ok: true as const, links: rows };
}

export async function createTaskLinkAction(slug: string, _prev: unknown, formData: FormData) {
  const parsed = CreateTaskLinkSchema.safeParse({
    fromTaskId: formData.get("fromTaskId"),
    toTaskId: formData.get("toTaskId"),
    type: formData.get("type"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    const row = await withActiveWorkspace(async (tx, ws) =>
      links.createTaskLink(tx, ws.id, parsed.data),
    );
    revalidatePath(`/${slug}`);
    return { ok: true as const, link: row };
  } catch (e) {
    if (e instanceof links.LinkCycleError) {
      return { error: "This dependency would create a cycle." };
    }
    if (e instanceof Error && /unique|duplicate/i.test(e.message)) {
      return { error: "That link already exists." };
    }
    throw e;
  }
}

export async function deleteTaskLinkAction(slug: string, formData: FormData) {
  const parsed = DeleteLinkSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  await withActiveWorkspace(async (tx, ws) => links.deleteTaskLink(tx, ws.id, parsed.data.id));
  revalidatePath(`/${slug}`);
  return { ok: true as const };
}

export async function listProjectLinksAction(input: { projectId: string }) {
  const parsed = ListProjectLinksSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const rows = await withActiveWorkspace(async (tx, ws) =>
    links.listProjectLinks(tx, ws.id, parsed.data.projectId),
  );
  return { ok: true as const, links: rows };
}

export async function createProjectLinkAction(slug: string, _prev: unknown, formData: FormData) {
  const parsed = CreateProjectLinkSchema.safeParse({
    fromProjectId: formData.get("fromProjectId"),
    toProjectId: formData.get("toProjectId"),
    type: formData.get("type"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    const row = await withActiveWorkspace(async (tx, ws) =>
      links.createProjectLink(tx, ws.id, parsed.data),
    );
    revalidatePath(`/${slug}`);
    return { ok: true as const, link: row };
  } catch (e) {
    if (e instanceof links.LinkCycleError) {
      return { error: "This dependency would create a cycle." };
    }
    if (e instanceof Error && /unique|duplicate/i.test(e.message)) {
      return { error: "That link already exists." };
    }
    throw e;
  }
}

export async function deleteProjectLinkAction(slug: string, formData: FormData) {
  const parsed = DeleteLinkSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  await withActiveWorkspace(async (tx, ws) => links.deleteProjectLink(tx, ws.id, parsed.data.id));
  revalidatePath(`/${slug}`);
  return { ok: true as const };
}
