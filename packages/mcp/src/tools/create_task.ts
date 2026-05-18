import { z } from "zod";
import { defineTool } from "./types.js";

export const createTask = defineTool({
  name: "create_task",
  description:
    "Create a single task in a project. Tags are workspace-scoped labels (created on the fly if missing); dependencies create `blocks` task links if the referenced tasks exist.",
  inputSchema: z.object({
    project: z.string().min(1).describe("Project key, e.g. 'PROJ'."),
    title: z.string().min(1).max(500),
    description: z.string().max(20_000).optional(),
    status: z.enum(["open", "in_progress", "done"]).optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
    type: z.enum(["task", "story", "bug", "epic"]).optional(),
    milestone: z.string().min(1).optional().describe("Milestone name to attach to (must already exist)."),
    tags: z.array(z.string().min(1)).max(50).optional(),
    dependsOn: z
      .array(z.string().min(1))
      .max(50)
      .optional()
      .describe("Task keys this task depends on (creates `blocks` links pointing at this task)."),
  }),
  async handler(input, client) {
    return client.post("/api/v1/tasks", input);
  },
});
