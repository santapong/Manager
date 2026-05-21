import { and, asc, eq, or } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import {
  labels as labelsTable,
  milestones,
  projects,
  subtasks,
  taskLabels,
  taskLinks,
  tasks,
} from "@manager/db";
import { withApiAuthResponse } from "@/src/lib/api-auth";

export const runtime = "nodejs";

/**
 * GET /api/v1/tasks/:taskKey
 *
 * `taskKey` is the project-stable key (e.g. `PROJ-12`). Returns the task
 * detail with subtasks, labels, milestone, and incoming/outgoing task links
 * inlined.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ taskKey: string }> }) {
  const { taskKey } = await ctx.params;
  return withApiAuthResponse(req, async (db, auth) => {
    // `tasks.key` is unique per project, NOT per workspace. We resolve by
    // splitting on `-` and looking up the project key, then matching the
    // task key within that project.
    const lastDash = taskKey.lastIndexOf("-");
    if (lastDash <= 0) {
      return NextResponse.json({ error: "invalid_task_key" }, { status: 400 });
    }
    const projectKey = taskKey.slice(0, lastDash);
    const [project] = await db
      .select({ id: projects.id, key: projects.key })
      .from(projects)
      .where(and(eq(projects.workspaceId, auth.workspaceId), eq(projects.key, projectKey)))
      .limit(1);
    if (!project) {
      return NextResponse.json({ error: "project_not_found" }, { status: 404 });
    }
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.projectId, project.id), eq(tasks.key, taskKey)))
      .limit(1);
    if (!task) {
      return NextResponse.json({ error: "task_not_found" }, { status: 404 });
    }

    let milestone: { id: string; name: string } | null = null;
    if (task.milestoneId) {
      const [ms] = await db
        .select({ id: milestones.id, name: milestones.name })
        .from(milestones)
        .where(eq(milestones.id, task.milestoneId))
        .limit(1);
      milestone = ms ?? null;
    }

    const subtaskRows = await db
      .select()
      .from(subtasks)
      .where(eq(subtasks.taskId, task.id))
      .orderBy(asc(subtasks.position), asc(subtasks.createdAt));

    const labelRows = await db
      .select({ id: labelsTable.id, name: labelsTable.name, color: labelsTable.color })
      .from(taskLabels)
      .innerJoin(labelsTable, eq(labelsTable.id, taskLabels.labelId))
      .where(eq(taskLabels.taskId, task.id));

    const linkRows = await db
      .select()
      .from(taskLinks)
      .where(or(eq(taskLinks.fromTaskId, task.id), eq(taskLinks.toTaskId, task.id)));

    return NextResponse.json(
      {
        task: {
          id: task.id,
          key: task.key,
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          type: task.type,
          assigneeId: task.assigneeId,
          dueAt: task.dueAt,
          points: task.points,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
        },
        project: { key: project.key },
        milestone,
        subtasks: subtaskRows.map((s) => ({
          id: s.id,
          title: s.title,
          done: s.done,
          position: s.position,
        })),
        labels: labelRows,
        links: linkRows.map((l) => ({
          id: l.id,
          fromTaskId: l.fromTaskId,
          toTaskId: l.toTaskId,
          type: l.type,
          direction: l.fromTaskId === task.id ? "outgoing" : "incoming",
        })),
      },
      { status: 200 },
    );
  });
}
