import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { z } from "zod";
import { createClient, ManagerApiErrorImpl, type ManagerClient } from "./client.js";
import { loadConfig, type ServerConfig } from "./config.js";
import { tools as defaultTools, type ToolDefinition } from "./tools/index.js";

const PACKAGE_NAME = "manager-mcp";
const PACKAGE_VERSION = "0.1.0";

export interface CreateServerOptions {
  config?: ServerConfig;
  client?: ManagerClient;
  tools?: ToolDefinition[];
}

/**
 * Build the MCP server. Pulled out of `cli.ts` so the test suite can wire
 * up a fake client and exercise tool dispatch without touching the network.
 *
 * Returns both the SDK `Server` and the resolved `ManagerClient` so callers
 * can intercept either side. The caller picks the transport (stdio for the
 * `.mcpb` bundle; HTTP transport lands in a follow-up — see decisions §2).
 */
export function createServer(opts: CreateServerOptions = {}): {
  server: Server;
  client: ManagerClient;
  tools: ToolDefinition[];
} {
  const tools = opts.tools ?? defaultTools;
  const client =
    opts.client ??
    createClient(opts.config ?? loadConfig());

  const server = new Server(
    {
      name: PACKAGE_NAME,
      version: PACKAGE_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // ListTools — convert each Zod schema to JSON Schema at registration.
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: zodToJsonSchema(t.inputSchema),
      })),
    };
  });

  // CallTool — validate input with Zod before invoking the handler.
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = tools.find((t) => t.name === req.params.name);
    if (!tool) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "unknown_tool", name: req.params.name }) }],
        isError: true,
      };
    }
    const parsed = tool.inputSchema.safeParse(req.params.arguments ?? {});
    if (!parsed.success) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: "invalid_input",
              issues: parsed.error.issues.map((i) => ({
                path: i.path.join("."),
                message: i.message,
              })),
            }),
          },
        ],
        isError: true,
      };
    }
    try {
      const result = await tool.handler(parsed.data, client);
      return {
        content: [
          {
            type: "text",
            text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (e) {
      const body =
        e instanceof ManagerApiErrorImpl
          ? { error: e.message, status: e.status, body: e.body }
          : { error: e instanceof Error ? e.message : "tool_failed" };
      return {
        content: [{ type: "text", text: JSON.stringify(body, null, 2) }],
        isError: true,
      };
    }
  });

  return { server, client, tools };
}

/** Connect the server to a transport. Used by the CLI and integration tests. */
export async function connectServer(server: Server, transport: Transport): Promise<void> {
  await server.connect(transport);
}

/**
 * Wrap `z.toJSONSchema` so callers don't need to know the casting dance.
 * Zod v4 ships JSON Schema generation in core — see `zod` 4.x release notes.
 */
function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const out = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  // The MCP protocol expects an object schema at the top level. If the tool
  // takes no inputs we still want `{ "type": "object", "properties": {} }`.
  if (!("type" in out)) {
    return { type: "object", properties: {}, ...out };
  }
  return out;
}
