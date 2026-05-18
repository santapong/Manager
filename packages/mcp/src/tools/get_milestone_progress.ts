import { z } from "zod";
import { defineTool } from "./types.js";

interface ListMilestonesResponse {
  milestones: Array<{
    id: string;
    name: string;
    progress: { open: number; in_progress: number; done: number; total: number };
  }>;
}

export const getMilestoneProgress = defineTool({
  name: "get_milestone_progress",
  description:
    "Get rolled-up progress for a single milestone in a project, identified by name. Returns counts and a percentage.",
  inputSchema: z.object({
    project: z.string().min(1).describe("Project key, e.g. 'PROJ'."),
    milestone: z.string().min(1).describe("Milestone name."),
  }),
  async handler(input, client) {
    const data = await client.get<ListMilestonesResponse>(
      `/api/v1/projects/${encodeURIComponent(input.project)}/milestones`,
    );
    const match = data.milestones.find(
      (m) => m.name.toLowerCase() === input.milestone.toLowerCase(),
    );
    if (!match) {
      return { error: "milestone_not_found", milestone: input.milestone };
    }
    const pct = match.progress.total === 0 ? 0 : Math.round((match.progress.done / match.progress.total) * 100);
    return { milestone: { id: match.id, name: match.name }, progress: match.progress, percentDone: pct };
  },
});
