import { and, asc, eq, inArray } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import {
  labels as labelsTable,
  milestones,
  projects,
  taskLabels,
  tasks,
} from "@manager/db";
import { withApiAuthResponse } from "@/src/lib/api-auth";

export const runtime = "nodejs";

/**
 * GET /api/v1/projects/:key/tasks
 *
 * Query params:
 *   - `milestone`: milestone name (case-insensitive)
 *   - `status`:    one of `open` | `in_progress` | `done`
 *   - `label`:     label name (case-insensitive)
 *
 * Returns a flat list of tasks belonging to the project. Labels are inlined
 * so callers don't need a second roundtrip per task.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const url = new URL(req.url);
  const milestoneFilter = url.searchParams.get("milestone")?.trim();
  const statusFilter = url.searchParams.get("status")?.trim();
  const labelFilter = url.searchParams.get("label")?.trim();

  return withApiAuthResponse(req, async (db, auth) => {
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.workspaceId, auth.workspaceId), eq(projects.key, key)))
      .limit(1);
    if (!project) {
      return NextResponse.json({ error: "project_not_found" }, { status: 404 });
    }

    const conditions = [eq(tasks.projectId, project.id)];

    if (statusFilter) {
      if (!["open", "in_progress", "done"].includes(statusFilter)) {
        return NextResponse.json({ error: "invalid_status_filter" }, { status: 400 });
      }
      conditions.push(eq(tasks.status, statusFilter as "open" | "in_progress" | "done"));
    }

    if (milestoneFilter) {
      const [ms] = await db
        .select({ id: milestones.id })
        .from(milestones)
        .where(and(eq(milestones.projectId, project.id), eq(milestones.name, milestoneFilter)))
        .limit(1);
      if (!ms) {
        return NextResponse.json({ tasks: [] }, { status: 200 });
      }
      conditions.push(eq(tasks.milestoneId, ms.id));
    }

    if (labelFilter) {
      const [label] = await db
        .select({ id: labelsTable.id })
        .from(labelsTable)
        .where(
          and(eq(labelsTable.workspaceId, auth.workspaceId), eq(labelsTable.name, labelFilter)),
        )
        .limit(1);
      if (!label) {
        return NextResponse.json({ tasks: [] }, { status: 200 });
      }
      const taskIdRows = await db
        .select({ taskId: taskLabels.taskId })
        .from(taskLabels)
        .where(eq(taskLabels.labelId, label.id));
      const allowedIds = taskIdRows.map((r) => r.taskId);
      if (allowedIds.length === 0) {
        return NextResponse.json({ tasks: [] }, { status: 200 });
      }
      conditions.push(inArray(tasks.id, allowedIds));
    }

    const taskRows = await db
      .select({
        id: tasks.id,
        key: tasks.key,
        title: tasks.title,
        status: tasks.status,
        priority: tasks.priority,
        type: tasks.type,
        milestoneId: tasks.milestoneId,
        assigneeId: tasks.assigneeId,
        dueAt: tasks.dueAt,
        points: tasks.points,
        position: tasks.position,
        updatedAt: tasks.updatedAt,
      })
      .from(tasks)
      .where(and(...conditions))
      .orderBy(asc(tasks.position), asc(tasks.createdAt));

    // Inline labels per task in a single query.
    const labelsByTask = new Map<string, Array<{ name: string; color: string }>>();
    if (taskRows.length > 0) {
      const ids = taskRows.map((t) => t.id);
      const joined = await db
        .select({
          taskId: taskLabels.taskId,
          name: labelsTable.name,
          color: labelsTable.color,
        })
        .from(taskLabels)
        .innerJoin(labelsTable, eq(labelsTable.id, taskLabels.labelId))
        .where(inArray(taskLabels.taskId, ids));
      for (const r of joined) {
        const arr = labelsByTask.get(r.taskId) ?? [];
        arr.push({ name: r.name, color: r.color });
        labelsByTask.set(r.taskId, arr);
      }
    }

    return NextResponse.json(
      {
        tasks: taskRows.map((t) => ({ ...t, labels: labelsByTask.get(t.id) ?? [] })),
      },
      { status: 200 },
    );
  });
}
