import { z } from "zod";

/**
 * Team chat validators (Wave 3). Channels-only v1; DMs are a follow-up.
 * Mirrors the label/comment validator idioms.
 */

export const CreateChannelSchema = z.object({
  name: z.string().min(1).max(80),
});

export const PostMessageSchema = z.object({
  channelId: z.string().uuid(),
  body: z.string().min(1).max(4000),
});

export const ChannelIdSchema = z.object({
  channelId: z.string().uuid(),
});
