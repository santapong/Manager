import { parseMarkdown, type Diagnostic, type PlanIR } from "@manager/plan-ir";
import type { Database } from "@manager/db";
import { preview } from "./preview";
import type { ImportDiff } from "./types";

export interface ParseAndPreviewResult {
  ir: PlanIR;
  diff: ImportDiff;
  diagnostics: Diagnostic[];
}

/**
 * Parse a Markdown source and produce a preview diff against the workspace.
 *
 * If parsing returns blocking errors, we still attempt the preview (the IR
 * is best-effort) but the caller should refuse to commit when diagnostics
 * include any `error`-level entries.
 *
 * Caller must already be inside `withActiveWorkspace`.
 */
export async function parseAndPreview(
  db: Database,
  workspaceId: string,
  markdown: string,
): Promise<ParseAndPreviewResult> {
  const { ir, diagnostics: parseDiagnostics } = parseMarkdown(markdown);
  const { diff, diagnostics: previewDiagnostics } = await preview(db, workspaceId, ir);
  return {
    ir,
    diff,
    diagnostics: [...parseDiagnostics, ...previewDiagnostics],
  };
}
