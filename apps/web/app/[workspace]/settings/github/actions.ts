"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/src/lib/auth";
import { withActiveWorkspace } from "@/src/lib/workspace-context";
import {
  ConnectionIdSchema,
  ConnectRepoSchema,
} from "@/src/lib/validators/github";
import {
  createConnection,
  deleteConnection,
  regenerateSecret,
} from "@/src/server/github";

type ActionResult = { ok: true } | { error: string };

/**
 * Connect a repository to the active workspace. Accepts "owner/name" or a full
 * GitHub URL in the `repo` field. Maps a unique violation (already connected)
 * to a friendly message.
 */
export async function connectRepoAction(slug: string, formData: FormData): Promise<ActionResult> {
  const parsed = ConnectRepoSchema.safeParse({
    repo: formData.get("repo"),
    owner: formData.get("owner"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid repository" };
  }

  const session = await (await auth()).requireSession();

  try {
    await withActiveWorkspace((tx, ws) =>
      createConnection(tx, {
        workspaceId: ws.id,
        owner: parsed.data.owner,
        repo: parsed.data.repo,
        userId: session.user.id,
      }),
    );
  } catch (e) {
    if (e instanceof Error && /unique|duplicate/i.test(e.message)) {
      return { error: "That repository is already connected." };
    }
    throw e;
  }

  revalidatePath(`/${slug}/settings/github`);
  return { ok: true };
}

/** Disconnect a repository (drops the connection + its webhook secret). */
export async function disconnectAction(slug: string, formData: FormData): Promise<ActionResult> {
  const parsed = ConnectionIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid request" };
  }

  await withActiveWorkspace((tx, ws) => deleteConnection(tx, ws.id, parsed.data.id));
  revalidatePath(`/${slug}/settings/github`);
  return { ok: true };
}

/** Rotate the webhook signing secret for a connection. */
export async function regenerateSecretAction(
  slug: string,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = ConnectionIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid request" };
  }

  const row = await withActiveWorkspace((tx, ws) =>
    regenerateSecret(tx, ws.id, parsed.data.id),
  );
  if (!row) return { error: "Connection not found." };

  revalidatePath(`/${slug}/settings/github`);
  return { ok: true };
}
