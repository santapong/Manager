import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { PlanIRSchema } from "@manager/plan-ir";
import { auth } from "@/src/lib/auth";
import { withActiveWorkspace } from "@/src/lib/workspace-context";
import { commit } from "@/src/server/imports";

export const runtime = "nodejs";

const BodySchema = z.object({ ir: PlanIRSchema });

/**
 * POST /api/imports/commit
 *
 * Body: { ir: PlanIR }
 * Returns: { createdIds, diagnostics, skipped }
 *
 * The IR is expected to be one the preview endpoint just returned. The
 * server re-validates it; the entire commit runs in a single transaction
 * under `withActiveWorkspace`, so partial commits cannot land.
 */
export async function POST(req: NextRequest) {
  const svc = await auth();
  let session;
  try {
    session = await svc.requireSession();
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

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

  try {
    const result = await withActiveWorkspace(async (tx, ws) =>
      commit(tx, ws.id, parsed.data.ir, { userId: session.user.id }),
    );
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "commit_failed";
    if (message === "no_active_workspace") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
