import { z } from "zod";
import { defineTool } from "./types.js";

export const updateTaskStatus = defineTool({
  name: "update_task_status",
  description: "Update the status of a single task (open / in_progress / done).",
  inputSchema: z.object({
    taskKey: z.string().min(1).describe("Task key, e.g. 'PROJ-12'."),
    status: z.enum(["open", "in_progress", "done"]),
  }),
  async handler(input, client) {
    return client.post(`/api/v1/tasks/${encodeURIComponent(input.taskKey)}/status`, {
      status: input.status,
    });
  },
});
