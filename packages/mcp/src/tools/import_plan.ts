import { z } from "zod";
import { defineTool } from "./types.js";

/**
 * Wraps `/api/v1/import/preview` and `/api/v1/import/commit`.
 *
 * - `dryRun: true` (default) → preview only, returns the parsed IR + diff.
 * - `dryRun: false`          → preview, fail if parse has errors, then commit.
 *
 * Markdown is the only supported format in v1 (per decisions §1). CSV /
 * XLSX land in a follow-up; the input schema is wired to accept them now
 * so the protocol surface doesn't churn when they arrive.
 */
export const importPlan = defineTool({
  name: "import_plan",
  description:
    "Import a plan document into Manager. Markdown is supported in v1; CSV / XLSX are deferred. By default runs as a dry-run (preview + diff). Pass `dryRun: false` to commit.",
  inputSchema: z.object({
    format: z.enum(["markdown"]).default("markdown"),
    content: z.string().min(1).max(5 * 1024 * 1024),
    dryRun: z.boolean().default(true),
  }),
  async handler(input, client) {
    if (input.dryRun) {
      return client.post("/api/v1/import/preview", {
        format: input.format,
        content: input.content,
      });
    }
    return client.post("/api/v1/import/commit", {
      format: input.format,
      content: input.content,
    });
  },
});
