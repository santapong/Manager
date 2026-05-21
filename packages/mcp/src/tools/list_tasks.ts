import { z } from "zod";
import { defineTool } from "./types.js";

export const listTasks = defineTool({
  name: "list_tasks",
  description:
    "List tasks in a project. Optional filters narrow by milestone name, status, and/or label.",
  inputSchema: z.object({
    project: z.string().min(1).describe("Project key, e.g. 'PROJ'."),
    milestone: z.string().min(1).optional().describe("Milestone name to filter by."),
    status: z
      .enum(["open", "in_progress", "done"])
      .optional()
      .describe("Task status to filter by."),
    label: z.string().min(1).optional().describe("Label name to filter by."),
  }),
  async handler(input, client) {
    return client.get(`/api/v1/projects/${encodeURIComponent(input.project)}/tasks`, {
      milestone: input.milestone,
      status: input.status,
      label: input.label,
    });
  },
});
