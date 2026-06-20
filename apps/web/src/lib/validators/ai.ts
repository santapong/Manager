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
