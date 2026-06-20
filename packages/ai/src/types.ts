// AIService port — the vendor-neutral contract the rest of the app depends on.
// The concrete Anthropic implementation lives in `anthropic-adapter.ts`; no
// vendor SDK type ever crosses this boundary. Mirrors the @manager/realtime,
// @manager/search, and @manager/email ports (ADR 0001, ADR 0002 §1).

/** Default model for the assistant. Never append a date suffix (ADR 0002 §3). */
export const DEFAULT_MODEL = "claude-opus-4-8";

/** Reasoning depth → maps to the provider's `output_config.effort`. */
export type Effort = "low" | "medium" | "high";

/** A single conversational turn. System prompt is passed separately. */
export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CompleteInput {
  /** Per-call bearer credential — the workspace's BYO key, decrypted at call time. */
  apiKey: string;
  /** Defaults to {@link DEFAULT_MODEL}. */
  model?: string;
  /** Frozen instruction prefix. */
  system?: string;
  messages: AIMessage[];
  /** Reasoning effort; defaults to "low" for single-turn assist. */
  effort?: Effort;
  /** Output token cap; defaults to a sensible single-turn value in the adapter. */
  maxTokens?: number;
}

export interface CompleteResult {
  /** Concatenated text of every text block in the model's reply. */
  text: string;
}

/**
 * A model-callable tool, vendor-neutral. `inputSchema` is a JSON Schema object
 * ({ type: "object", properties, required }) the adapter forwards verbatim as
 * the provider's `input_schema`. The model produces an `input` matching it; the
 * app (never the adapter) executes the tool — see {@link StreamHandlers}.
 */
export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface StreamChatInput {
  /** Per-call bearer credential — the workspace's BYO key, decrypted at call time. */
  apiKey: string;
  /** Defaults to {@link DEFAULT_MODEL}. */
  model?: string;
  /** Frozen instruction prefix. */
  system?: string;
  messages: AIMessage[];
  /** Read-only tools the model may call; omit for a plain chat. */
  tools?: ToolDef[];
  /** Reasoning effort; defaults to "low". */
  effort?: Effort;
  /** Output token cap; defaults to a sensible value in the adapter. */
  maxTokens?: number;
}

/**
 * Callbacks the adapter drives while streaming. `onText` fires for every text
 * delta as it arrives. `executeTool` runs a model-requested tool and resolves
 * to the string fed back as that tool's result; it MUST enforce tenancy/RLS —
 * the adapter trusts whatever it returns. Tool execution lives in the app so
 * the vendor SDK never touches the database.
 */
export interface StreamHandlers {
  onText(delta: string): void;
  executeTool(name: string, input: unknown): Promise<string>;
}

/**
 * Vendor-neutral AI port. The adapter constructs a fresh client per call from
 * the supplied `apiKey` (keys are per-workspace, never global).
 */
export interface AIService {
  complete(input: CompleteInput): Promise<CompleteResult>;
  /**
   * Cheaply check whether `apiKey` is accepted by the provider. Returns false
   * on an authentication failure; rethrows transport/other errors so callers
   * can distinguish "rejected" from "couldn't reach the provider".
   */
  validateKey(apiKey: string): Promise<boolean>;
  /**
   * Multi-turn streaming chat with an optional read-only tool loop. Text deltas
   * are pushed through `handlers.onText`; `tool_use` requests are dispatched to
   * `handlers.executeTool` and their results fed back automatically until the
   * model finishes (capped internally). Resolves with the final assembled text.
   */
  streamChat(input: StreamChatInput, handlers: StreamHandlers): Promise<{ text: string }>;
}
