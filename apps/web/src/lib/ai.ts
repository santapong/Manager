import { createAnthropicAIService, type AIService } from "@manager/ai";

/**
 * App-side construction of the AIService port (ADR 0002 §1) — the one place
 * the app picks an AI adapter, mirroring realtime.ts / email.ts. The Anthropic
 * adapter is stateless: it builds a fresh client per call from the per-call
 * (per-workspace, decrypted) apiKey, so it holds no credential of its own and a
 * single shared instance is safe.
 */
const ai: AIService = createAnthropicAIService();

export function aiService(): AIService {
  return ai;
}
