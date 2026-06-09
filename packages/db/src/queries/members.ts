import { asc, eq } from "drizzle-orm";
import type { Database } from "../client";
import { memberships, users } from "../schema";

export interface WorkspaceMember {
  userId: string;
  email: string;
  name: string | null;
  image: string | null;
  role: "owner" | "admin" | "member" | "guest";
}

/**
 * All members of a workspace with their user profile, for assignee pickers
 * and (later) mention autocomplete. `users` has no RLS; the join is scoped
 * by the filtered `memberships` side.
 */
export async function listMembers(db: Database, workspaceId: string): Promise<WorkspaceMember[]> {
  return db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      image: users.image,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(eq(memberships.workspaceId, workspaceId))
    .orderBy(asc(users.email));
}
