"use server";

import { revalidatePath } from "next/cache";
import { markAllRead, markRead } from "@manager/db/queries";
import { auth } from "@/src/lib/auth";
import { z } from "zod";
import { withActiveWorkspace } from "@/src/lib/workspace-context";

const MarkReadSchema = z.object({ id: z.string().uuid() });

export async function markReadAction(slug: string, input: { id: string }) {
  const parsed = MarkReadSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const svc = await auth();
  const session = await svc.requireSession();
  await withActiveWorkspace(async (tx, ws) =>
    markRead(tx, { workspaceId: ws.id, userId: session.user.id, id: parsed.data.id }),
  );
  revalidatePath(`/${slug}/inbox`);
  return { ok: true as const };
}

export async function markAllReadAction(slug: string) {
  const svc = await auth();
  const session = await svc.requireSession();
  await withActiveWorkspace(async (tx, ws) =>
    markAllRead(tx, { workspaceId: ws.id, userId: session.user.id }),
  );
  revalidatePath(`/${slug}/inbox`);
  return { ok: true as const };
}
