// Single-turn assist functions (ADR 0002). Each loads the workspace's
// decrypted BYO key, and if present calls the AIService with a short, focused
// system prompt. No-key is a typed result, not an exception, so callers can
// surface a friendly "set a key first" message. The decrypted key lives only
// for the duration of the call and is never logged or returned.
import { createAnthropicAIService, type AIService } from "@manager/ai";
import { type Database } from "@manager/db";
import { getDecryptedKey } from "./ai-keys";

/** Discriminated result: either generated text, or a "no key configured" signal. */
export type AssistResult = { ok: true; text: string } | { ok: false; reason: "no_key" };

// One stateless adapter instance is fine — it builds a fresh client per call
// from the per-call apiKey, so it holds no credential of its own.
const ai: AIService = createAnthropicAIService();

const SUMMARIZE_SYSTEM =
  "You are a concise assistant inside a project-management app. Summarize the user's text in 2-4 sentences, plain language, no preamble. Preserve key names, dates, and decisions.";

const ACCEPTANCE_CRITERIA_SYSTEM =
  "You are a product assistant inside a project-management app. From the user's description, write clear, testable acceptance criteria as a short markdown checklist using Given/When/Then phrasing where it fits. Output only the checklist, no preamble.";

async function runAssist(
  db: Database,
  workspaceId: string,
  system: string,
  text: string,
): Promise<AssistResult> {
  const apiKey = await getDecryptedKey(db, workspaceId);
  if (!apiKey) return { ok: false, reason: "no_key" };

  const { text: out } = await ai.complete({
    apiKey,
    system,
    messages: [{ role: "user", content: text }],
    effort: "low",
  });
  return { ok: true, text: out.trim() };
}

/** Summarize free-form text (notes, a long description, a thread). */
export function summarizeText(
  db: Database,
  workspaceId: string,
  text: string,
): Promise<AssistResult> {
  return runAssist(db, workspaceId, SUMMARIZE_SYSTEM, text);
}

/** Draft acceptance criteria from a task/feature description. */
export function draftAcceptanceCriteria(
  db: Database,
  workspaceId: string,
  text: string,
): Promise<AssistResult> {
  return runAssist(db, workspaceId, ACCEPTANCE_CRITERIA_SYSTEM, text);
}
