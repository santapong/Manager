import { and, asc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  labels as labelsTable,
  lists as listsTable,
  milestones,
  projects,
  taskLabels,
  taskLinks,
  tasks,
} from "@manager/db";
import { createTask } from "@manager/db/queries";
import { withApiAuthResponse } from "@/src/lib/api-auth";
import { getOrCreate as getOrCreateLabel } from "@/src/server/labels";
import { createTaskLink, LinkCycleError } from "@/src/server/links";

export const runtime = "nodejs";

const BodySchema = z.object({
  project: z.string().min(1),
  title: z.string().min(1).max(500),
  description: z.string().max(20_000).optional(),
  status: z.enum(["open", "in_progress", "done"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  type: z.enum(["task", "story", "bug", "epic"]).optional(),
  milestone: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)).max(50).optional(),
  /** Other task keys this task depends on. We create `blocks` links pointing at them. */
  dependsOn: z.array(z.string().min(1)).max(50).optional(),
});

/**
 * POST /api/v1/tasks
 *
 * Create a single task. Tag and milestone are resolved by name within the
 * project workspace; dependencies are advisory — if a referenced task key
 * is missing, we report it in `unresolvedDependencies` rather than failing.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_body",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }
  const input = parsed.data;

  return withApiAuthResponse(req, async (db, auth) => {
    const [project] = await db
      .select({ id: projects.id, key: projects.key })
      .from(projects)
      .where(and(eq(projects.workspaceId, auth.workspaceId), eq(projects.key, input.project)))
      .limit(1);
    if (!project) {
      return NextResponse.json({ error: "project_not_found" }, { status: 404 });
    }

    // Find a default list for the project. The bootstrapper creates a
    // "Backlog" list with position 0 — fall back to whatever's earliest.
    const [list] = await db
      .select({ id: listsTable.id })
      .from(listsTable)
      .where(eq(listsTable.projectId, project.id))
      .orderBy(asc(listsTable.position))
      .limit(1);
    if (!list) {
      return NextResponse.json({ error: "project_has_no_lists" }, { status: 409 });
    }

    let milestoneId: string | null = null;
    if (input.milestone) {
      const [ms] = await db
        .select({ id: milestones.id })
        .from(milestones)
        .where(and(eq(milestones.projectId, project.id), eq(milestones.name, input.milestone)))
        .limit(1);
      if (!ms) {
        return NextResponse.json(
          { error: "milestone_not_found", milestone: input.milestone },
          { status: 404 },
        );
      }
      milestoneId = ms.id;
    }

    const task = await createTask(db, {
      workspaceId: auth.workspaceId,
      projectId: project.id,
      listId: list.id,
      milestoneId,
      title: input.title,
      description: input.description ?? null,
      status: input.status ?? "open",
      priority: input.priority ?? "medium",
      type: input.type ?? "task",
    });

    // Attach labels (workspace-scoped, get-or-create).
    if (input.tags && input.tags.length > 0) {
      for (const name of input.tags) {
        const lbl = await getOrCreateLabel(db, auth.workspaceId, name);
        await db
          .insert(taskLabels)
          .values({ taskId: task.id, labelId: lbl.id })
          .onConflictDoNothing();
      }
    }

    const unresolvedDependencies: string[] = [];
    const createdLinkIds: string[] = [];
    if (input.dependsOn && input.dependsOn.length > 0) {
      for (const depKey of input.dependsOn) {
        const lastDash = depKey.lastIndexOf("-");
        if (lastDash <= 0) {
          unresolvedDependencies.push(depKey);
          continue;
        }
        const depProjectKey = depKey.slice(0, lastDash);
        const [depProject] = await db
          .select({ id: projects.id })
          .from(projects)
          .where(
            and(eq(projects.workspaceId, auth.workspaceId), eq(projects.key, depProjectKey)),
          )
          .limit(1);
        if (!depProject) {
          unresolvedDependencies.push(depKey);
          continue;
        }
        const [depTask] = await db
          .select({ id: tasks.id })
          .from(tasks)
          .where(and(eq(tasks.projectId, depProject.id), eq(tasks.key, depKey)))
          .limit(1);
        if (!depTask) {
          unresolvedDependencies.push(depKey);
          continue;
        }
        try {
          const link = await createTaskLink(db, auth.workspaceId, {
            fromTaskId: depTask.id,
            toTaskId: task.id,
            type: "blocks",
          });
          createdLinkIds.push(link.id);
        } catch (e) {
          if (e instanceof LinkCycleError) {
            unresolvedDependencies.push(`${depKey} (would create a cycle)`);
          } else {
            throw e;
          }
        }
      }
    }

    return NextResponse.json(
      {
        task: {
          id: task.id,
          key: task.key,
          title: task.title,
          status: task.status,
          priority: task.priority,
          type: task.type,
          milestoneId: task.milestoneId,
        },
        createdLinkIds,
        unresolvedDependencies,
      },
      { status: 201 },
    );
  });
}

/** Avoid TS "unused import" + nudge the linter that the import is intentional. */
void taskLinks;
void labelsTable;
