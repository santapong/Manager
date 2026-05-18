import { asc, eq } from "drizzle-orm";
import { type NextRequest } from "next/server";
import { projects } from "@manager/db";
import { withApiAuth } from "@/src/lib/api-auth";

export const runtime = "nodejs";

/**
 * GET /api/v1/projects
 *
 * List all projects in the workspace identified by `X-Workspace-Slug`.
 */
export async function GET(req: NextRequest) {
  return withApiAuth(req, async (db, ctx) => {
    const rows = await db
      .select({
        id: projects.id,
        key: projects.key,
        name: projects.name,
        startDate: projects.startDate,
        targetDate: projects.targetDate,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .where(eq(projects.workspaceId, ctx.workspaceId))
      .orderBy(asc(projects.key));
    return { projects: rows };
  });
}
