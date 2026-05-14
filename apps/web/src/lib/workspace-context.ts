import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { dbNode, memberships, withWorkspace, workspaces, type Database } from "@manager/db";
import { env } from "../env";
import { auth } from "./auth";

export const ACTIVE_WORKSPACE_COOKIE = "mgr_ws";

export interface ActiveWorkspace {
  id: string;
  slug: string;
  name: string;
  role: "owner" | "admin" | "member" | "guest";
}

/**
 * Resolve the active workspace for the current request, or null if the
 * user is signed in but has no membership yet (drives /welcome onboarding).
 * Throws when unauthenticated.
 */
export async function getActiveWorkspace(): Promise<ActiveWorkspace | null> {
  const svc = await auth();
  const session = await svc.requireSession();
  const cookieStore = await cookies();
  const desiredId = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value;
  const db = dbNode(env.DATABASE_URL);

  const all = await db
    .select({
      id: workspaces.id,
      slug: workspaces.slug,
      name: workspaces.name,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(workspaces, eq(memberships.workspaceId, workspaces.id))
    .where(eq(memberships.userId, session.user.id));

  if (all.length === 0) return null;
  const chosen = (desiredId ? all.find((w) => w.id === desiredId) : undefined) ?? all[0]!;
  if (chosen.id !== desiredId) {
    cookieStore.set(ACTIVE_WORKSPACE_COOKIE, chosen.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return chosen as ActiveWorkspace;
}

/**
 * Run `fn` with RLS scoped to the active workspace. Standard path
 * for every Server Action and route handler that touches tenant data.
 */
export async function withActiveWorkspace<T>(
  fn: (tx: Database, ws: ActiveWorkspace) => Promise<T>,
): Promise<T> {
  const ws = await getActiveWorkspace();
  if (!ws) throw new Error("no_active_workspace");
  const db = dbNode(env.DATABASE_URL);
  return withWorkspace(db, ws.id, (tx) => fn(tx, ws));
}
