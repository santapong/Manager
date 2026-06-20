"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/src/lib/auth";
import { withActiveWorkspace } from "@/src/lib/workspace-context";
import {
  CreateDocumentSchema,
  DocumentIdSchema,
  UpdateDocumentSchema,
} from "@/src/lib/validators/document";
import {
  createDocument,
  deleteDocument,
  updateDocument,
} from "@/src/server/documents";

/**
 * Server Actions for the documents (wiki) feature. Each action validates with
 * zod, scopes writes to the active workspace via RLS, then revalidates the
 * affected paths. Single-writer model -- real-time co-editing is deferred.
 */

async function currentUserId(): Promise<string> {
  const session = await (await auth()).requireSession();
  return session.user.id;
}

export async function createDocumentAction(slug: string, formData: FormData) {
  const parsed = CreateDocumentSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const userId = await currentUserId();
  const row = await withActiveWorkspace(async (tx, ws) =>
    createDocument(tx, {
      workspaceId: ws.id,
      title: parsed.data.title,
      body: parsed.data.body,
      userId,
    }),
  );
  revalidatePath(`/${slug}/docs`);
  return { ok: true as const, id: row.id };
}

export async function updateDocumentAction(slug: string, formData: FormData) {
  const parsed = UpdateDocumentSchema.safeParse({
    id: formData.get("id"),
    title: formData.get("title") || undefined,
    body: formData.get("body") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { id, ...patch } = parsed.data;
  const userId = await currentUserId();
  const row = await withActiveWorkspace(async (tx, ws) =>
    updateDocument(tx, ws.id, id, { ...patch, userId }),
  );
  if (!row) return { error: "Document not found." };
  revalidatePath(`/${slug}/docs`);
  revalidatePath(`/${slug}/docs/${id}`);
  return { ok: true as const };
}

export async function deleteDocumentAction(slug: string, formData: FormData) {
  const parsed = DocumentIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  await withActiveWorkspace(async (tx, ws) => deleteDocument(tx, ws.id, parsed.data.id));
  revalidatePath(`/${slug}/docs`);
  return { ok: true as const };
}
