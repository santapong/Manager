"use server";

import { revalidatePath } from "next/cache";
import { logger } from "@manager/observability";
import { auth } from "@/src/lib/auth";
import { REALTIME_ENABLED, realtimeService } from "@/src/lib/realtime";
import { withActiveWorkspace } from "@/src/lib/workspace-context";
import { CreateChannelSchema, PostMessageSchema } from "@/src/lib/validators/chat";
import { createChannel, getChannel, postMessage } from "@/src/server/chat";

/** Channel naming for realtime fanout — must match the token route's `ws:{id}:` prefix. */
function chatChannelName(workspaceId: string, channelId: string): string {
  return `ws:${workspaceId}:chat:${channelId}`;
}

/**
 * Create a workspace chat channel. `useActionState` signature
 * `(slug, prev, formData)`. Maps the unique(workspaceId, lower(name)) violation
 * to a friendly message and returns the new id so the client can navigate.
 */
export async function createChannelAction(slug: string, _prev: unknown, formData: FormData) {
  const parsed = CreateChannelSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const svc = await auth();
  const session = await svc.requireSession();

  try {
    const row = await withActiveWorkspace(async (tx, ws) =>
      createChannel(tx, {
        workspaceId: ws.id,
        name: parsed.data.name,
        createdBy: session.user.id,
      }),
    );
    revalidatePath(`/${slug}/chat`);
    return { ok: true as const, id: row.id };
  } catch (e) {
    if (e instanceof Error && /unique|duplicate/i.test(e.message)) {
      return { error: `Channel "${parsed.data.name}" already exists.` };
    }
    throw e;
  }
}

/**
 * Post a message to a channel as the current user. After the insert commits we
 * best-effort publish to the channel's realtime topic; a publish failure is
 * logged but never fails the message.
 */
export async function postMessageAction(slug: string, formData: FormData) {
  const parsed = PostMessageSchema.safeParse({
    channelId: formData.get("channelId"),
    body: formData.get("body"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const svc = await auth();
  const session = await svc.requireSession();

  const result = await withActiveWorkspace(async (tx, ws) => {
    const channel = await getChannel(tx, ws.id, parsed.data.channelId);
    if (!channel) return { error: "channel_not_found" as const };
    const message = await postMessage(tx, {
      workspaceId: ws.id,
      channelId: parsed.data.channelId,
      authorId: session.user.id,
      body: parsed.data.body,
    });
    return { ok: true as const, workspaceId: ws.id, message };
  });

  if ("error" in result) return { error: result.error };

  if (REALTIME_ENABLED) {
    try {
      await realtimeService().publish({
        channel: chatChannelName(result.workspaceId, parsed.data.channelId),
        event: "message.created",
        payload: { channelId: parsed.data.channelId, messageId: result.message.id },
      });
    } catch (e) {
      logger.warn("realtime_publish_failed", {
        event: "message.created",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  revalidatePath(`/${slug}/chat/${parsed.data.channelId}`);
  return { ok: true as const };
}
