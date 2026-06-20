// Anthropic implementation of the AIService port. This is the ONLY file
// permitted to import `@anthropic-ai/sdk` (enforced by the ESLint
// no-restricted-imports rule, like the realtime Ably adapter). Everything
// outside this file talks to the vendor-neutral `AIService` interface.
// eslint-disable-next-line no-restricted-imports
import Anthropic, { AuthenticationError } from "@anthropic-ai/sdk";
import {
  DEFAULT_MODEL,
  type AIService,
  type CompleteInput,
  type StreamChatInput,
  type StreamHandlers,
  type ToolDef,
} from "./types";

// SDK message/content/tool types live on the Anthropic namespace, not as
// top-level exports — alias them here so they don't leak past this file.
type MessageParam = Anthropic.MessageParam;
type ContentBlockParam = Anthropic.ContentBlockParam;
type ToolResultBlockParam = Anthropic.ToolResultBlockParam;
type SdkTool = Anthropic.Tool;

/** Single-turn assist replies are short; this caps runaway output. */
const DEFAULT_MAX_TOKENS = 16_000;

/** Hard ceiling on tool-call round-trips so a confused model can't loop forever. */
const MAX_TOOL_ITERATIONS = 5;

/**
 * Build the Anthropic-backed AIService. A fresh `Anthropic` client is created
 * per call because the credential is per-workspace (BYO key) and decrypted
 * only at call time — we never hold a long-lived global client.
 *
 * Adaptive thinking + `output_config.effort` are the only knobs we send.
 * `temperature`/`top_p`/`top_k`/`budget_tokens` are intentionally omitted —
 * Opus 4.8 rejects them (ADR 0002 §3).
 */
export function createAnthropicAIService(): AIService {
  return {
    async complete(input: CompleteInput) {
      const client = new Anthropic({ apiKey: input.apiKey });
      const msg = await client.messages.create({
        model: input.model ?? DEFAULT_MODEL,
        max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
        thinking: { type: "adaptive" },
        output_config: { effort: input.effort ?? "low" },
        ...(input.system ? { system: input.system } : {}),
        messages: input.messages.map((m) => ({ role: m.role, content: m.content })),
      });

      const text = msg.content
        .filter((block): block is Extract<typeof block, { type: "text" }> => block.type === "text")
        .map((block) => block.text)
        .join("");

      return { text };
    },

    streamChat: (input: StreamChatInput, handlers: StreamHandlers) => streamChat(input, handlers),

    validateKey: (apiKey: string) => validateKey(apiKey),
  };
}

/** Map a vendor-neutral ToolDef to the SDK's tool shape. */
function toSdkTool(tool: ToolDef): SdkTool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema as SdkTool["input_schema"],
  };
}

/**
 * Stream a chat turn, running the manual tool loop (ADR 0002 §2). We `stream()`
 * one assistant turn at a time, forwarding text deltas to `handlers.onText`.
 * When the turn stops on `tool_use`, every tool block is executed via
 * `handlers.executeTool` (the app's RLS-scoped executor) and the results are
 * sent back as a single user message, then we stream the next turn. The loop
 * ends on `end_turn`/`max_tokens`/etc. or after {@link MAX_TOOL_ITERATIONS}.
 *
 * Only `output_config.effort` + adaptive thinking are sent; temperature/top_p/
 * top_k/budget_tokens are omitted (Opus 4.8 rejects them).
 */
async function streamChat(
  input: StreamChatInput,
  handlers: StreamHandlers,
): Promise<{ text: string }> {
  const client = new Anthropic({ apiKey: input.apiKey });
  const tools = input.tools?.map(toSdkTool);

  // Running transcript: starts from the caller's messages, grows by the
  // assistant turn + tool-result user message on each tool iteration.
  const messages: MessageParam[] = input.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let fullText = "";

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const stream = client.messages.stream({
      model: input.model ?? DEFAULT_MODEL,
      max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
      thinking: { type: "adaptive" },
      output_config: { effort: input.effort ?? "low" },
      ...(input.system ? { system: input.system } : {}),
      ...(tools ? { tools } : {}),
      messages,
    });

    stream.on("text", (delta) => {
      fullText += delta;
      handlers.onText(delta);
    });

    const finalMessage = await stream.finalMessage();

    if (finalMessage.stop_reason !== "tool_use") {
      // Plain text turn — we're done.
      return { text: fullText };
    }

    // Execute every tool_use block and gather one tool_result per call.
    const toolResults: ToolResultBlockParam[] = [];
    for (const block of finalMessage.content) {
      if (block.type !== "tool_use") continue;
      let resultContent: string;
      let isError = false;
      try {
        resultContent = await handlers.executeTool(block.name, block.input);
      } catch (err) {
        // Surface a compact error back to the model so it can recover, never
        // the raw stack — and never abort the whole stream on one bad tool.
        resultContent = `Tool error: ${err instanceof Error ? err.message : "failed"}`;
        isError = true;
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: resultContent,
        ...(isError ? { is_error: true } : {}),
      });
    }

    // Append the assistant turn + our tool results, then loop to stream again.
    messages.push({ role: "assistant", content: finalMessage.content as ContentBlockParam[] });
    messages.push({ role: "user", content: toolResults });
  }

  // Hit the iteration cap with tools still pending — return whatever text we have.
  return { text: fullText };
}

/**
 * Cheaply verify a key by retrieving the default model's metadata. A thrown
 * `AuthenticationError` means the key is invalid → return false. Any other
 * error (network, rate limit, outage) is rethrown so the caller doesn't
 * silently treat an outage as a bad key.
 */
export async function validateKey(apiKey: string): Promise<boolean> {
  const client = new Anthropic({ apiKey });
  try {
    await client.models.retrieve(DEFAULT_MODEL);
    return true;
  } catch (err) {
    if (err instanceof AuthenticationError) return false;
    throw err;
  }
}
