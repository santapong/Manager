import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { parseAndPreview } from "@/src/server/imports";
import { withApiAuthResponse } from "@/src/lib/api-auth";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024;

const BodySchema = z.object({
  format: z.enum(["markdown"]).default("markdown"),
  content: z.string().min(1).max(MAX_BYTES),
});

/**
 * POST /api/v1/import/preview
 *
 * Integration-API equivalent of `/api/imports/preview` — same parser and
 * preview, but authenticated with `MANAGER_API_KEY` + `X-Workspace-Slug`
 * instead of a session cookie. Used by the MCP `import_plan` tool.
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
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (parsed.data.format !== "markdown") {
    return NextResponse.json(
      { error: "format_not_supported", deferred: ["csv", "xlsx"] },
      { status: 415 },
    );
  }

  return withApiAuthResponse(req, async (db, auth) => {
    const result = await parseAndPreview(db, auth.workspaceId, parsed.data.content);
    return NextResponse.json(result, { status: 200 });
  });
}
