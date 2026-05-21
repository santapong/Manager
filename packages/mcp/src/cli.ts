#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { connectServer, createServer } from "./server.js";
import { ConfigError } from "./config.js";

/**
 * Entry point used by the `manager-mcp` bin and by the `.mcpb` Claude
 * Desktop runtime. Stdio transport only in v1 — HTTP transport ships in a
 * follow-up once PAT auth is wired (decisions §2).
 *
 * Any startup error is logged to stderr (NOT stdout — stdout is the MCP
 * channel) and the process exits non-zero so Claude Desktop surfaces it.
 */
async function main(): Promise<void> {
  let server;
  try {
    ({ server } = createServer());
  } catch (e) {
    if (e instanceof ConfigError) {
      process.stderr.write(`[manager-mcp] config error: ${e.message}\n`);
    } else {
      process.stderr.write(
        `[manager-mcp] failed to start: ${e instanceof Error ? e.message : String(e)}\n`,
      );
    }
    process.exit(1);
  }
  const transport = new StdioServerTransport();
  await connectServer(server, transport);
  // Server runs until stdin closes; node will exit naturally.
}

main().catch((e) => {
  process.stderr.write(`[manager-mcp] fatal: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
  process.exit(1);
});
