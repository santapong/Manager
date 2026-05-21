import { and, asc, eq, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { milestones, projects, tasks } from "@manager/db";
import { withApiAuthResponse } from "@/src/lib/api-auth";

export const runtime = "nodejs";

/**
 * GET /api/v1/projects/:key
 *
 * Returns project detail with milestone count and task count summary.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  return withApiAuthResponse(req, async (db, auth) => {
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.workspaceId, auth.workspaceId), eq(projects.key, key)))
      .limit(1);
    if (!project) {
      return NextResponse.json({ error: "project_not_found" }, { status: 404 });
    }
    const milestoneRows = await db
      .select({ id: milestones.id, name: milestones.name, status: milestones.status })
      .from(milestones)
      .where(eq(milestones.projectId, project.id))
      .orderBy(asc(milestones.position));
    const statusRows = await db
      .select({ status: tasks.status, count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(eq(tasks.projectId, project.id))
      .groupBy(tasks.status);
    const taskCounts: Record<string, number> = { open: 0, in_progress: 0, done: 0 };
    for (const r of statusRows) taskCounts[r.status] = r.count;

    return NextResponse.json(
      {
        project: {
          id: project.id,
          key: project.key,
          name: project.name,
          startDate: project.startDate,
          targetDate: project.targetDate,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        },
        milestones: milestoneRows,
        taskCounts,
      },
      { status: 200 },
    );
  });
}
