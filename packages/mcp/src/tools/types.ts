import { z } from "zod";
import type { ManagerClient } from "../client.js";

/**
 * Shape every tool module exports. Keeping the schema as a Zod object lets
 * the registry validate inputs at runtime AND convert to JSON Schema for
 * the MCP protocol via `z.toJSONSchema`.
 */
export interface ToolDefinition<TInput extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  inputSchema: TInput;
  /**
   * Run the tool. Receives the validated input plus the HTTP client to
   * Manager. Return any JSON-serialisable value — the server wraps it as
   * MCP tool output.
   */
  handler: (input: z.infer<TInput>, client: ManagerClient) => Promise<unknown>;
}

/** Convenience constructor that preserves the input type for handler. */
export function defineTool<TInput extends z.ZodTypeAny>(
  def: ToolDefinition<TInput>,
): ToolDefinition<TInput> {
  return def;
}
