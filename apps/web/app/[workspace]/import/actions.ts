"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PlanIRSchema, type PlanIR } from "@manager/plan-ir";
import { auth } from "@/src/lib/auth";
import { withActiveWorkspace } from "@/src/lib/workspace-context";
import { commit, parseAndPreview } from "@/src/server/imports";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const PreviewFormSchema = z.object({
  format: z.enum(["markdown"]).default("markdown"),
  content: z.string().min(1).max(MAX_BYTES),
});

/**
 * Parse + preview a plan from the import form.
 * Returns `{ ir, diff, diagnostics }` for the UI to render before commit.
 */
export async function previewPlanAction(_prev: unknown, formData: FormData) {
  const raw = {
    format: (formData.get("format") as string) || "markdown",
    content: String(formData.get("content") ?? ""),
  };
  const parsed = PreviewFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const result = await withActiveWorkspace(async (tx, ws) =>
      parseAndPreview(tx, ws.id, parsed.data.content),
    );
    return { ok: true as const, ...result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "preview_failed" };
  }
}

/**
 * Commit a previously-previewed IR. The IR is what the preview returned;
 * the client should not synthesise its own IR.
 */
export async function commitPlanAction(slug: string, ir: PlanIR) {
  const parsed = PlanIRSchema.safeParse(ir);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid PlanIR" };
  }
  const svc = await auth();
  const session = await svc.requireSession();
  try {
    const result = await withActiveWorkspace(async (tx, ws) =>
      commit(tx, ws.id, parsed.data, { userId: session.user.id }),
    );
    revalidatePath(`/${slug}`);
    return { ok: true as const, ...result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "commit_failed" };
  }
}
