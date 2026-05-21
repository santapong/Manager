import { z } from "zod";
import { defineTool } from "./types.js";

export const listProjects = defineTool({
  name: "list_projects",
  description:
    "List every project in the configured Manager workspace. Returns key, name, and target/start dates.",
  inputSchema: z.object({}),
  async handler(_input, client) {
    return client.get("/api/v1/projects");
  },
});
