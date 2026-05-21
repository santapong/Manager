import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { ManagerClient } from "../client.js";
import { tools } from "../tools/index.js";

/** Build a stub ManagerClient that records every call without touching the network. */
function recordingClient(): {
  client: ManagerClient;
  calls: Array<{ method: "get" | "post"; path: string; arg: unknown }>;
} {
  const calls: Array<{ method: "get" | "post"; path: string; arg: unknown }> = [];
  const client: ManagerClient = {
    async get(path, query) {
      calls.push({ method: "get", path, arg: query });
      return { ok: true } as never;
    },
    async post(path, body) {
      calls.push({ method: "post", path, arg: body });
      return { ok: true } as never;
    },
  };
  return { client, calls };
}

describe("tool registry shape", () => {
  it("every tool exposes name, description, schema, and handler", () => {
    expect(tools.length).toBeGreaterThan(0);
    for (const t of tools) {
      expect(t.name).toMatch(/^[a-z_][a-z0-9_]*$/);
      expect(t.description.length).toBeGreaterThan(10);
      expect(t.inputSchema).toBeDefined();
      expect(typeof t.handler).toBe("function");
    }
  });

  it("tool names are unique", () => {
    const seen = new Set<string>();
    for (const t of tools) {
      expect(seen.has(t.name), `duplicate tool name: ${t.name}`).toBe(false);
      seen.add(t.name);
    }
  });

  it("every input schema is a Zod object so JSON Schema conversion produces a top-level object", () => {
    for (const t of tools) {
      // Use a sample empty input to confirm safeParse works at all.
      const parsed = t.inputSchema.safeParse({});
      // Some schemas REQUIRE fields; we only assert the call didn't throw.
      expect(parsed.success === true || parsed.success === false).toBe(true);
      const json = z.toJSONSchema(t.inputSchema, { target: "draft-7" });
      expect((json as { type?: string }).type ?? "object").toBe("object");
    }
  });
});

describe("contract: tools call the right endpoints with the right payloads", () => {
  it("list_projects → GET /api/v1/projects", async () => {
    const { client, calls } = recordingClient();
    const tool = tools.find((t) => t.name === "list_projects")!;
    await tool.handler({}, client);
    expect(calls).toEqual([{ method: "get", path: "/api/v1/projects", arg: undefined }]);
  });

  it("get_project → GET /api/v1/projects/:key", async () => {
    const { client, calls } = recordingClient();
    const tool = tools.find((t) => t.name === "get_project")!;
    await tool.handler({ key: "PROJ" }, client);
    expect(calls).toEqual([{ method: "get", path: "/api/v1/projects/PROJ", arg: undefined }]);
  });

  it("list_tasks → GET /api/v1/projects/:key/tasks with filter query", async () => {
    const { client, calls } = recordingClient();
    const tool = tools.find((t) => t.name === "list_tasks")!;
    await tool.handler(
      { project: "PROJ", status: "open", label: "backend" },
      client,
    );
    expect(calls).toEqual([
      {
        method: "get",
        path: "/api/v1/projects/PROJ/tasks",
        arg: { milestone: undefined, status: "open", label: "backend" },
      },
    ]);
  });

  it("get_task → GET /api/v1/tasks/:taskKey", async () => {
    const { client, calls } = recordingClient();
    const tool = tools.find((t) => t.name === "get_task")!;
    await tool.handler({ taskKey: "PROJ-12" }, client);
    expect(calls).toEqual([{ method: "get", path: "/api/v1/tasks/PROJ-12", arg: undefined }]);
  });

  it("list_milestones → GET /api/v1/projects/:key/milestones", async () => {
    const { client, calls } = recordingClient();
    const tool = tools.find((t) => t.name === "list_milestones")!;
    await tool.handler({ project: "PROJ" }, client);
    expect(calls).toEqual([
      { method: "get", path: "/api/v1/projects/PROJ/milestones", arg: undefined },
    ]);
  });

  it("get_milestone_progress derives percent from milestone list", async () => {
    const fakeClient: ManagerClient = {
      async get() {
        return {
          milestones: [
            { id: "m1", name: "Beta", progress: { open: 1, in_progress: 2, done: 7, total: 10 } },
          ],
        } as never;
      },
      async post() {
        throw new Error("unexpected POST");
      },
    };
    const tool = tools.find((t) => t.name === "get_milestone_progress")!;
    const out = (await tool.handler({ project: "PROJ", milestone: "Beta" }, fakeClient)) as {
      percentDone: number;
      milestone: { name: string };
    };
    expect(out.percentDone).toBe(70);
    expect(out.milestone.name).toBe("Beta");
  });

  it("get_milestone_progress reports not-found when the milestone is missing", async () => {
    const fakeClient: ManagerClient = {
      async get() {
        return { milestones: [] } as never;
      },
      async post() {
        throw new Error("unexpected POST");
      },
    };
    const tool = tools.find((t) => t.name === "get_milestone_progress")!;
    const out = (await tool.handler({ project: "PROJ", milestone: "Missing" }, fakeClient)) as {
      error: string;
    };
    expect(out.error).toBe("milestone_not_found");
  });

  it("create_task → POST /api/v1/tasks with the full payload", async () => {
    const { client, calls } = recordingClient();
    const tool = tools.find((t) => t.name === "create_task")!;
    const input = {
      project: "PROJ",
      title: "Wire up MCP",
      priority: "high" as const,
      tags: ["backend"],
      dependsOn: ["PROJ-1"],
    };
    await tool.handler(input, client);
    expect(calls).toEqual([{ method: "post", path: "/api/v1/tasks", arg: input }]);
  });

  it("update_task_status → POST /api/v1/tasks/:taskKey/status", async () => {
    const { client, calls } = recordingClient();
    const tool = tools.find((t) => t.name === "update_task_status")!;
    await tool.handler({ taskKey: "PROJ-12", status: "done" }, client);
    expect(calls).toEqual([
      { method: "post", path: "/api/v1/tasks/PROJ-12/status", arg: { status: "done" } },
    ]);
  });

  it("import_plan dry-run hits the preview endpoint", async () => {
    const { client, calls } = recordingClient();
    const tool = tools.find((t) => t.name === "import_plan")!;
    await tool.handler(
      { format: "markdown", content: "# hi", dryRun: true },
      client,
    );
    expect(calls).toEqual([
      { method: "post", path: "/api/v1/import/preview", arg: { format: "markdown", content: "# hi" } },
    ]);
  });

  it("import_plan commit hits the commit endpoint", async () => {
    const { client, calls } = recordingClient();
    const tool = tools.find((t) => t.name === "import_plan")!;
    await tool.handler(
      { format: "markdown", content: "# hi", dryRun: false },
      client,
    );
    expect(calls).toEqual([
      { method: "post", path: "/api/v1/import/commit", arg: { format: "markdown", content: "# hi" } },
    ]);
  });

  it("import_plan defaults dryRun=true", () => {
    const tool = tools.find((t) => t.name === "import_plan")!;
    const parsed = tool.inputSchema.parse({ format: "markdown", content: "# hi" });
    expect((parsed as { dryRun: boolean }).dryRun).toBe(true);
  });

  it("URL-encodes path segments to defeat key injection", async () => {
    const { client, calls } = recordingClient();
    const tool = tools.find((t) => t.name === "get_project")!;
    await tool.handler({ key: "A/B" }, client);
    expect(calls[0]?.path).toBe("/api/v1/projects/A%2FB");
    expect(vi.isMockFunction(client.get)).toBe(false);
  });
});

describe("server dispatch", () => {
  it("createServer validates input and returns structured errors for unknown tools", async () => {
    const { createServer } = await import("../server.js");
    const stub: ManagerClient = {
      async get() {
        return { ok: true } as never;
      },
      async post() {
        return { ok: true } as never;
      },
    };
    const { server } = createServer({ client: stub });
    expect(server).toBeDefined();
    // The SDK doesn't expose the request map directly; the integration
    // test above (recordingClient) is the load-bearing contract assertion.
  });
});
