"use server";

import { revalidatePath } from "next/cache";
import { logger } from "@manager/observability";
import { validateKey } from "@manager/ai";
import { auth } from "@/src/lib/auth";
import { withActiveWorkspace } from "@/src/lib/workspace-context";
import { aiEncryptionConfigured } from "@/src/lib/ai/crypto";
import { AssistSchema, SetKeySchema } from "@/src/lib/validators/ai";
import { removeKey, setKey } from "@/src/server/ai-keys";
import { summarizeText } from "@/src/server/ai";

type SetKeyResult = { ok: true; last4: string } | { error: string };
type RemoveResult = { ok: true } | { error: string };
type SummarizeResult = { ok: true; text: string } | { error: string };

function isOwnerOrAdmin(role: string): boolean {
  return role === "owner" || role === "admin";
}

/**
 * Validate, verify, and store the workspace's Anthropic key. Owner/admin only.
 * The key is checked against Anthropic with a cheap ping BEFORE we persist, so
 * a bad key never lands in the DB. The plaintext is never logged and never
 * echoed back — only `last4` is returned.
 */
export async function setKeyAction(slug: string, formData: FormData): Promise<SetKeyResult> {
  if (!aiEncryptionConfigured()) {
    return { error: "AI is not configured on this server. Ask your platform admin to set AI_ENCRYPTION_KEY." };
  }

  const parsed = SetKeySchema.safeParse({ apiKey: formData.get("apiKey") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid key" };
  }
  const apiKey = parsed.data.apiKey;

  const session = await (await auth()).requireSession();

  // Verify the key with the provider before persisting. A clean `false` means
  // Anthropic rejected the credential; a thrown error means we couldn't reach
  // them — surface those differently so users aren't told a good key is bad.
  let valid: boolean;
  try {
    valid = await validateKey(apiKey);
  } catch (e) {
    logger.error("ai_key_validation_unreachable", {
      slug,
      error: e instanceof Error ? e.message : String(e),
    });
    return { error: "Couldn't reach Anthropic to verify the key. Try again in a moment." };
  }
  if (!valid) {
    return { error: "That key was rejected by Anthropic." };
  }

  const result = await withActiveWorkspace(async (tx, ws) => {
    if (!isOwnerOrAdmin(ws.role)) {
      return { error: "Only owners and admins can change the AI key." };
    }
    await setKey(tx, { workspaceId: ws.id, apiKey, createdBy: session.user.id });
    return { ok: true as const, last4: apiKey.slice(-4) };
  });

  if ("error" in result) return result;
  revalidatePath(`/${slug}/settings/ai`);
  return result;
}

/** Remove the workspace's AI key. Owner/admin only. */
export async function removeKeyAction(slug: string, _formData: FormData): Promise<RemoveResult> {
  const result = await withActiveWorkspace(async (tx, ws) => {
    if (!isOwnerOrAdmin(ws.role)) {
      return { error: "Only owners and admins can change the AI key." };
    }
    await removeKey(tx, ws.id);
    return { ok: true as const };
  });

  if ("error" in result) return result;
  revalidatePath(`/${slug}/settings/ai`);
  return result;
}

/**
 * "Try it" path — summarize pasted text end-to-end. Available to any member
 * (read-only assist), but only works once an owner/admin has set a key.
 */
export async function summarizeAction(slug: string, formData: FormData): Promise<SummarizeResult> {
  const parsed = AssistSchema.safeParse({ text: formData.get("text") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const result = await withActiveWorkspace((tx, ws) =>
      summarizeText(tx, ws.id, parsed.data.text),
    );
    if (!result.ok) {
      return { error: "No AI key is set for this workspace yet." };
    }
    return { ok: true, text: result.text };
  } catch (e) {
    logger.error("ai_summarize_failed", {
      slug,
      error: e instanceof Error ? e.message : String(e),
    });
    return { error: "The assistant couldn't complete that request. Try again." };
  }
}
