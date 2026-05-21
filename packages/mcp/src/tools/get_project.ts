import { z } from "zod";
import { defineTool } from "./types.js";

export const getProject = defineTool({
  name: "get_project",
  description:
    "Fetch a single project by its key (e.g. 'PROJ'). Includes milestone summary and task-status counts.",
  inputSchema: z.object({
    key: z.string().min(1).describe("Project key, e.g. 'PROJ'."),
  }),
  async handler(input, client) {
    return client.get(`/api/v1/projects/${encodeURIComponent(input.key)}`);
  },
});
