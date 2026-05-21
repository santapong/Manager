import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { PlanIRSchema } from "@manager/plan-ir";
import { commit, parseAndPreview } from "@/src/server/imports";
import { withApiAuthResponse } from "@/src/lib/api-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Body variants:
 *   - `{ ir: PlanIR }` — commit the IR returned by `/api/v1/import/preview`.
 *   - `{ format: 'markdown', content: string }` — convenience parse+commit
 *     in one call; the MCP `import_plan` tool uses this.
 */
const BodySchema = z.union([
  z.object({ ir: PlanIRSchema }),
  z.object({
    format: z.enum(["markdown"]).default("markdown"),
    content: z.string().min(1).max(MAX_BYTES),
  }),
]);

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

  return withApiAuthResponse(req, async (db, auth) => {
    if ("ir" in parsed.data) {
      const result = await commit(db, auth.workspaceId, parsed.data.ir, { userId: null });
      return NextResponse.json(result, { status: 200 });
    }
    // Convenience path: parse + commit.
    const { ir, diagnostics } = await parseAndPreview(db, auth.workspaceId, parsed.data.content);
    const hasErrors = diagnostics.some((d) => d.level === "error");
    if (hasErrors) {
      return NextResponse.json(
        { error: "parse_errors", diagnostics },
        { status: 422 },
      );
    }
    const result = await commit(db, auth.workspaceId, ir, { userId: null });
    return NextResponse.json({ ...result, ir, parseDiagnostics: diagnostics }, { status: 200 });
  });
}
