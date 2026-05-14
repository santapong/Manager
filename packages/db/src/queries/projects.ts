import { and, eq } from "drizzle-orm";
import type { Database } from "../client";
import { lists, projects, type NewProject } from "../schema";

export async function getProjectByKey(db: Database, workspaceId: string, key: string) {
  const [row] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.workspaceId, workspaceId), eq(projects.key, key)))
    .limit(1);
  return row;
}

export async function listProjects(db: Database, workspaceId: string) {
  return db.select().from(projects).where(eq(projects.workspaceId, workspaceId));
}

export async function createProjectWithDefaultList(
  db: Database,
  input: Omit<NewProject, "id" | "createdAt" | "updatedAt" | "nextTaskSeq">,
) {
  return db.transaction(async (tx) => {
    const [project] = await tx.insert(projects).values(input).returning();
    if (!project) throw new Error("Project insert failed");
    await tx.insert(lists).values({
      workspaceId: input.workspaceId,
      projectId: project.id,
      name: "Backlog",
      position: 0,
    });
    return project;
  });
}
