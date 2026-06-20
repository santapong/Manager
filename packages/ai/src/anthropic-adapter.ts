// Anthropic implementation of the AIService port. This is the ONLY file
// permitted to import `@anthropic-ai/sdk` (enforced by the ESLint
// no-restricted-imports rule, like the realtime Ably adapter). Everything
// outside this file talks to the vendor-neutral `AIService` interface.
// eslint-disable-next-line no-restricted-imports
import Anthropic, { AuthenticationError } from "@anthropic-ai/sdk";
import { DEFAULT_MODEL, type AIService, type CompleteInput } from "./types";

/** Single-turn assist replies are short; this caps runaway output. */
const DEFAULT_MAX_TOKENS = 16_000;

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

    validateKey: (apiKey: string) => validateKey(apiKey),
  };
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
