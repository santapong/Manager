import { z } from "zod";
import { defineTool } from "./types.js";

export const listMilestones = defineTool({
  name: "list_milestones",
  description:
    "List a project's milestones with rolled-up progress (open / in_progress / done task counts).",
  inputSchema: z.object({
    project: z.string().min(1).describe("Project key, e.g. 'PROJ'."),
  }),
  async handler(input, client) {
    return client.get(`/api/v1/projects/${encodeURIComponent(input.project)}/milestones`);
  },
});
