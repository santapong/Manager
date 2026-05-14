"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { dbNode, memberships, withWorkspace, workspaces } from "@manager/db";
import { env } from "@/src/env";
import { auth } from "@/src/lib/auth";
import { ACTIVE_WORKSPACE_COOKIE } from "@/src/lib/workspace-context";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);

const CreateWorkspaceSchema = z.object({
  name: z.string().min(2).max(60),
  slug: z.string().min(2).max(32).regex(/^[a-z0-9-]+$/).optional(),
});

export async function createWorkspace(_prev: unknown, formData: FormData) {
  const svc = await auth();
  const session = await svc.requireSession();

  const parsed = CreateWorkspaceSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const name = parsed.data.name.trim();
  const slug = (parsed.data.slug ?? slugify(name)) || slugify(`${name}-${Date.now().toString(36)}`);

  const db = dbNode(env.DATABASE_URL);

  let workspaceId: string;
  try {
    workspaceId = await db.transaction(async (tx) => {
      const [ws] = await tx.insert(workspaces).values({ slug, name, plan: "free" }).returning();
      if (!ws) throw new Error("workspace_insert_failed");
      await tx.insert(memberships).values({
        workspaceId: ws.id,
        userId: session.user.id,
        role: "owner",
      });
      return ws.id;
    });
  } catch (e) {
    if (e instanceof Error && /unique/i.test(e.message)) {
      return { error: `Slug "${slug}" is taken — pick another.` };
    }
    throw e;
  }

  // Seed any future per-workspace defaults inside RLS context.
  await withWorkspace(db, workspaceId, async () => {
    // intentionally empty — placeholder for future default seeding
  });

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect(`/${slug}`);
}
