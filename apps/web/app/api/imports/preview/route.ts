import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { withActiveWorkspace } from "@/src/lib/workspace-context";
import { parseAndPreview } from "@/src/server/imports";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB hard limit on input content

const BodySchema = z.object({
  format: z.enum(["markdown"]).default("markdown"),
  content: z.string().min(1).max(MAX_BYTES),
});

/**
 * POST /api/imports/preview
 *
 * Body: { format: 'markdown', content: string }
 *  - OR multipart/form-data with `format` + `file` parts.
 *
 * Returns: { ir, diff, diagnostics }
 *
 * Only Markdown is supported in this wave. CSV/XLSX are deferred to a
 * follow-up (see `docs/plans/multi-format-plan-extraction.md` Milestone C).
 */
export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";

  let format = "markdown";
  let content = "";
  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      format = (form.get("format") as string) || "markdown";
      const file = form.get("file");
      if (file instanceof File) {
        if (file.size > MAX_BYTES) {
          return NextResponse.json(
            { error: "file_too_large", limitBytes: MAX_BYTES },
            { status: 413 },
          );
        }
        content = await file.text();
      } else {
        content = String(form.get("content") ?? "");
      }
    } else if (contentType.includes("application/json")) {
      const json = (await req.json()) as unknown;
      const parsed = BodySchema.safeParse(json);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message ?? "invalid_body" },
          { status: 400 },
        );
      }
      format = parsed.data.format;
      content = parsed.data.content;
    } else {
      return NextResponse.json({ error: "unsupported_content_type" }, { status: 415 });
    }
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (format !== "markdown") {
    return NextResponse.json(
      { error: "format_not_supported", deferred: ["csv", "xlsx"] },
      { status: 415 },
    );
  }
  if (content.length === 0) {
    return NextResponse.json({ error: "empty_content" }, { status: 400 });
  }
  if (content.length > MAX_BYTES) {
    return NextResponse.json(
      { error: "content_too_large", limitBytes: MAX_BYTES },
      { status: 413 },
    );
  }

  try {
    const result = await withActiveWorkspace(async (tx, ws) =>
      parseAndPreview(tx, ws.id, content),
    );
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "preview_failed";
    if (message === "no_active_workspace") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
