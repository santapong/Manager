import { z } from "zod";

/**
 * A pasted Anthropic key. All current keys carry the `sk-ant-` prefix; the
 * length floor rejects obvious typos before we spend a validation round-trip.
 * The real check is a live `validateKey` ping in the action.
 */
export const SetKeySchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(20, "That doesn't look like an Anthropic API key.")
    .startsWith("sk-ant-", "Anthropic keys start with sk-ant-."),
});
export type SetKeyInput = z.infer<typeof SetKeySchema>;

/** Free-form text for a single-turn assist (summarize / draft). */
export const AssistSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Enter some text first.")
    .max(20_000, "That's too long — keep it under 20,000 characters."),
});
export type AssistInput = z.infer<typeof AssistSchema>;

/**
 * A multi-turn chat transcript posted to the streaming assistant endpoint.
 * Only user/assistant roles cross the wire — the system prompt is fixed
 * server-side. Bounds keep a single request well under the token budget and
 * cap the conversation length the client may replay.
 */
export const ChatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(20_000),
      }),
    )
    .min(1)
    .max(50),
});
export type ChatInput = z.infer<typeof ChatSchema>;
