import { z } from "zod";
import { defineTool } from "./types.js";

export const getTask = defineTool({
  name: "get_task",
  description:
    "Fetch a single task by its key (e.g. 'PROJ-12'). Inlines subtasks, labels, milestone, and links.",
  inputSchema: z.object({
    taskKey: z.string().min(1).describe("Project-stable task key, e.g. 'PROJ-12'."),
  }),
  async handler(input, client) {
    return client.get(`/api/v1/tasks/${encodeURIComponent(input.taskKey)}`);
  },
});
