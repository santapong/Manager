"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  createTask as dbCreateTask,
  deleteTask as dbDeleteTask,
  updateTask as dbUpdateTask,
} from "@manager/db/queries";
import { lists, projects } from "@manager/db";
import { auth } from "@/src/lib/auth";
import {
  CreateTaskSchema,
  DeleteTaskSchema,
  UpdateTaskSchema,
} from "@/src/lib/validators/task";
import { withActiveWorkspace } from "@/src/lib/workspace-context";

const isoDateOrNull = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "Expected YYYY-MM-DD"), z.literal("")])
  .nullable()
  .optional();

const UpdateProjectMetaSchema = z.object({
  id: z.string().uuid(),
  targetDate: isoDateOrNull,
  startDate: isoDateOrNull,
});

async function resolveProject(slug: string, projectKey: string) {
  return withActiveWorkspace(async (tx, ws) => {
    const [project] = await tx
      .select({ id: projects.id, key: projects.key, name: projects.name })
      .from(projects)
      .where(eq(projects.key, projectKey))
      .limit(1);
    if (!project) throw new Error("project_not_found");
    const [list] = await tx
      .select({ id: lists.id })
      .from(lists)
      .where(eq(lists.projectId, project.id))
      .limit(1);
    if (!list) throw new Error("project_missing_default_list");
    return { workspaceSlug: ws.slug, project, listId: list.id };
  });
}

export async function createTask(slug: string, projectKey: string, _prev: unknown, formData: FormData) {
  const parsed = CreateTaskSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const svc = await auth();
  const session = await svc.requireSession();
  const { project, listId } = await resolveProject(slug, projectKey);

  await withActiveWorkspace(async (tx, ws) =>
    dbCreateTask(tx, {
      workspaceId: ws.id,
      projectId: project.id,
      listId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      createdBy: session.user.id,
    }),
  );
  revalidatePath(`/${slug}/projects/${projectKey}`);
  return { ok: true };
}

export async function updateTask(slug: string, projectKey: string, formData: FormData) {
  const parsed = UpdateTaskSchema.safeParse({
    id: formData.get("id"),
    title: formData.get("title") || undefined,
    status: formData.get("status") || undefined,
    priority: formData.get("priority") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  await withActiveWorkspace(async (tx) => dbUpdateTask(tx, parsed.data.id, parsed.data));
  revalidatePath(`/${slug}/projects/${projectKey}`);
  return { ok: true };
}

export async function deleteTask(slug: string, projectKey: string, formData: FormData) {
  const parsed = DeleteTaskSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  await withActiveWorkspace(async (tx) => dbDeleteTask(tx, parsed.data.id));
  revalidatePath(`/${slug}/projects/${projectKey}`);
  return { ok: true };
}

/**
 * Update project metadata (target_date, start_date). Wired from the project
 * header "Edit dates" dialog. We keep the surface minimal here — name/key
 * edits are out of scope for this wave.
 */
export async function updateProjectMeta(
  slug: string,
  projectKey: string,
  _prev: unknown,
  formData: FormData,
) {
  const parsed = UpdateProjectMetaSchema.safeParse({
    id: formData.get("id"),
    targetDate: formData.get("targetDate") || null,
    startDate: formData.get("startDate") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const patch: { targetDate: string | null; startDate: string | null } = {
    targetDate: parsed.data.targetDate ? parsed.data.targetDate : null,
    startDate: parsed.data.startDate ? parsed.data.startDate : null,
  };

  await withActiveWorkspace(async (tx, ws) =>
    tx
      .update(projects)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(projects.workspaceId, ws.id), eq(projects.id, parsed.data.id))),
  );
  revalidatePath(`/${slug}/projects/${projectKey}`);
  return { ok: true as const };
}
