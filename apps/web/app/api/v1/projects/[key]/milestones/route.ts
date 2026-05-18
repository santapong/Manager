import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { milestones, projects, tasks } from "@manager/db";
import { withApiAuthResponse } from "@/src/lib/api-auth";

export const runtime = "nodejs";

/**
 * GET /api/v1/projects/:key/milestones
 *
 * Returns the project's milestones with rolled-up progress (open / in_progress
 * / done counts).
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  return withApiAuthResponse(req, async (db, auth) => {
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.workspaceId, auth.workspaceId), eq(projects.key, key)))
      .limit(1);
    if (!project) {
      return NextResponse.json({ error: "project_not_found" }, { status: 404 });
    }
    const msRows = await db
      .select()
      .from(milestones)
      .where(eq(milestones.projectId, project.id))
      .orderBy(asc(milestones.position), asc(milestones.createdAt));

    const progressByMs = new Map<string, { open: number; in_progress: number; done: number }>();
    if (msRows.length > 0) {
      const ids = msRows.map((m) => m.id);
      const rows = await db
        .select({
          milestoneId: tasks.milestoneId,
          status: tasks.status,
          count: sql<number>`count(*)::int`,
        })
        .from(tasks)
        .where(inArray(tasks.milestoneId, ids))
        .groupBy(tasks.milestoneId, tasks.status);
      for (const r of rows) {
        if (!r.milestoneId) continue;
        const e = progressByMs.get(r.milestoneId) ?? { open: 0, in_progress: 0, done: 0 };
        e[r.status as "open" | "in_progress" | "done"] = r.count;
        progressByMs.set(r.milestoneId, e);
      }
    }
    return NextResponse.json(
      {
        milestones: msRows.map((m) => {
          const p = progressByMs.get(m.id) ?? { open: 0, in_progress: 0, done: 0 };
          return {
            id: m.id,
            name: m.name,
            description: m.description,
            targetDate: m.targetDate,
            status: m.status,
            position: m.position,
            progress: { ...p, total: p.open + p.in_progress + p.done },
          };
        }),
      },
      { status: 200 },
    );
  });
}
