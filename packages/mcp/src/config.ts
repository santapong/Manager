/**
 * Runtime configuration for the MCP server.
 *
 * The `.mcpb` install path in Claude Desktop sets these as env vars before
 * launching the stdio child process. See `manifest.json`'s `user_config`.
 */

export interface ServerConfig {
  baseUrl: string;
  apiKey: string;
  workspaceSlug: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const baseUrl = (env.MANAGER_BASE_URL ?? "http://localhost:3000").replace(/\/+$/u, "");
  const apiKey = env.MANAGER_API_KEY;
  const workspaceSlug = env.MANAGER_WORKSPACE_SLUG;

  if (!apiKey) {
    throw new ConfigError(
      "MANAGER_API_KEY is not set. Configure it via the .mcpb installer or your shell env.",
    );
  }
  if (!workspaceSlug) {
    throw new ConfigError(
      "MANAGER_WORKSPACE_SLUG is not set. Set it to the slug of the workspace this MCP server should act on.",
    );
  }
  return { baseUrl, apiKey, workspaceSlug };
}
