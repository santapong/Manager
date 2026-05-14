import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { memberships, workspaces } from "../schema";

export async function getWorkspaceBySlug(db: Database, slug: string) {
  const [row] = await db.select().from(workspaces).where(eq(workspaces.slug, slug)).limit(1);
  return row;
}

export async function listWorkspacesForUser(db: Database, userId: string) {
  return db
    .select({
      id: workspaces.id,
      slug: workspaces.slug,
      name: workspaces.name,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(workspaces, eq(memberships.workspaceId, workspaces.id))
    .where(eq(memberships.userId, userId));
}
