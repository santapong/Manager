import { and, eq, or } from "drizzle-orm";
import {
  projectLinks,
  taskLinks,
  type Database,
  type ProjectLink,
  type ProjectLinkType,
  type TaskLink,
  type TaskLinkType,
} from "@manager/db";
import { wouldCreateCycle } from "@manager/db/queries";

/**
 * Links service for task_links and project_links. Always called inside
 * `withActiveWorkspace`. Cycle detection runs via `wouldCreateCycle`
 * from `@manager/db/queries` — which traverses under the current RLS
 * workspace context.
 */

// --- task links ------------------------------------------------------------

export async function listTaskLinks(
  db: Database,
  workspaceId: string,
  taskId: string,
): Promise<TaskLink[]> {
  return db
    .select()
    .from(taskLinks)
    .where(
      and(
        eq(taskLinks.workspaceId, workspaceId),
        or(eq(taskLinks.fromTaskId, taskId), eq(taskLinks.toTaskId, taskId)),
      ),
    );
}

export interface CreateTaskLinkInput {
  fromTaskId: string;
  toTaskId: string;
  type: TaskLinkType;
}

export class LinkCycleError extends Error {
  constructor(message = "link_would_create_cycle") {
    super(message);
    this.name = "LinkCycleError";
  }
}

export async function createTaskLink(
  db: Database,
  workspaceId: string,
  input: CreateTaskLinkInput,
): Promise<TaskLink> {
  if (input.fromTaskId === input.toTaskId) {
    throw new LinkCycleError("link_self_reference");
  }
  // Only `blocks` is directional/cycle-relevant.
  if (input.type === "blocks") {
    const hasCycle = await wouldCreateCycle(
      db,
      input.fromTaskId,
      input.toTaskId,
      "task_blocks",
    );
    if (hasCycle) throw new LinkCycleError();
  }
  const [row] = await db
    .insert(taskLinks)
    .values({
      workspaceId,
      fromTaskId: input.fromTaskId,
      toTaskId: input.toTaskId,
      type: input.type,
    })
    .returning();
  if (!row) throw new Error("task_link_insert_failed");
  return row;
}

export async function deleteTaskLink(
  db: Database,
  workspaceId: string,
  id: string,
): Promise<void> {
  await db
    .delete(taskLinks)
    .where(and(eq(taskLinks.workspaceId, workspaceId), eq(taskLinks.id, id)));
}

// --- project links ---------------------------------------------------------

export async function listProjectLinks(
  db: Database,
  workspaceId: string,
  projectId: string,
): Promise<ProjectLink[]> {
  return db
    .select()
    .from(projectLinks)
    .where(
      and(
        eq(projectLinks.workspaceId, workspaceId),
        or(
          eq(projectLinks.fromProjectId, projectId),
          eq(projectLinks.toProjectId, projectId),
        ),
      ),
    );
}

export interface CreateProjectLinkInput {
  fromProjectId: string;
  toProjectId: string;
  type: ProjectLinkType;
}

export async function createProjectLink(
  db: Database,
  workspaceId: string,
  input: CreateProjectLinkInput,
): Promise<ProjectLink> {
  if (input.fromProjectId === input.toProjectId) {
    throw new LinkCycleError("link_self_reference");
  }
  if (input.type === "depends_on") {
    const hasCycle = await wouldCreateCycle(
      db,
      input.fromProjectId,
      input.toProjectId,
      "project_depends",
    );
    if (hasCycle) throw new LinkCycleError();
  }
  const [row] = await db
    .insert(projectLinks)
    .values({
      workspaceId,
      fromProjectId: input.fromProjectId,
      toProjectId: input.toProjectId,
      type: input.type,
    })
    .returning();
  if (!row) throw new Error("project_link_insert_failed");
  return row;
}

export async function deleteProjectLink(
  db: Database,
  workspaceId: string,
  id: string,
): Promise<void> {
  await db
    .delete(projectLinks)
    .where(and(eq(projectLinks.workspaceId, workspaceId), eq(projectLinks.id, id)));
}
