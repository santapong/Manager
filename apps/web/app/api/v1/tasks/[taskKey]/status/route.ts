import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { projects, tasks } from "@manager/db";
import { withApiAuthResponse } from "@/src/lib/api-auth";

export const runtime = "nodejs";

const BodySchema = z.object({
  status: z.enum(["open", "in_progress", "done"]),
});

/**
 * POST /api/v1/tasks/:taskKey/status
 *
 * Update the task status. We pick POST (not PATCH) so the MCP tool surface
 * stays uniform — every action verb is a POST.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ taskKey: string }> }) {
  const { taskKey } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  return withApiAuthResponse(req, async (db, auth) => {
    const lastDash = taskKey.lastIndexOf("-");
    if (lastDash <= 0) {
      return NextResponse.json({ error: "invalid_task_key" }, { status: 400 });
    }
    const projectKey = taskKey.slice(0, lastDash);
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.workspaceId, auth.workspaceId), eq(projects.key, projectKey)))
      .limit(1);
    if (!project) {
      return NextResponse.json({ error: "project_not_found" }, { status: 404 });
    }
    const [task] = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.projectId, project.id), eq(tasks.key, taskKey)))
      .limit(1);
    if (!task) {
      return NextResponse.json({ error: "task_not_found" }, { status: 404 });
    }
    const [updated] = await db
      .update(tasks)
      .set({ status: parsed.data.status, updatedAt: new Date() })
      .where(eq(tasks.id, task.id))
      .returning({ id: tasks.id, key: tasks.key, status: tasks.status });
    return NextResponse.json({ task: updated }, { status: 200 });
  });
}
