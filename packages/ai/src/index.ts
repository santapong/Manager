// @manager/ai — vendor-neutral AI port (ADR 0002 §1).
// Consumers import the AIService contract and the Anthropic factory from here;
// the vendor SDK stays inside `anthropic-adapter.ts`.
export * from "./types";
export { createAnthropicAIService, validateKey } from "./anthropic-adapter";
