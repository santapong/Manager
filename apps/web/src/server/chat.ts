import { and, asc, desc, eq } from "drizzle-orm";
import {
  chatChannels,
  chatMessages,
  users,
  type Database,
  type ChatChannel,
} from "@manager/db";

/**
 * Team chat queries (Wave 3). Workspace-scoped; always called inside
 * `withActiveWorkspace`, so the workspaceId filter is defense-in-depth on top
 * of RLS. v1 is channels only — DMs, unread counts and edit/delete are
 * intentional follow-ups.
 */

export async function listChannels(db: Database, workspaceId: string): Promise<ChatChannel[]> {
  return db
    .select()
    .from(chatChannels)
    .where(eq(chatChannels.workspaceId, workspaceId))
    .orderBy(asc(chatChannels.name));
}

export interface CreateChannelInput {
  workspaceId: string;
  name: string;
  createdBy: string | null;
}

/**
 * Insert a channel. A unique-violation on (workspaceId, lower(name)) bubbles up
 * as a thrown error; the action maps it to a friendly "channel exists" message.
 */
export async function createChannel(
  db: Database,
  input: CreateChannelInput,
): Promise<ChatChannel> {
  const [row] = await db
    .insert(chatChannels)
    .values({
      workspaceId: input.workspaceId,
      name: input.name,
      createdBy: input.createdBy,
    })
    .returning();
  if (!row) throw new Error("chat_channel_insert_failed");
  return row;
}

export async function getChannel(
  db: Database,
  workspaceId: string,
  id: string,
): Promise<ChatChannel | undefined> {
  const [row] = await db
    .select()
    .from(chatChannels)
    .where(and(eq(chatChannels.workspaceId, workspaceId), eq(chatChannels.id, id)))
    .limit(1);
  return row;
}

export interface ChatMessageWithAuthor {
  id: string;
  channelId: string;
  authorId: string | null;
  authorName: string | null;
  authorEmail: string | null;
  body: string;
  createdAt: Date;
}

/**
 * Latest `limit` messages for a channel, returned oldest-first for display.
 * We order by createdAt DESC + limit at the DB (cheapest path on the
 * (channelId, createdAt) index), then reverse to ascending in JS.
 */
export async function listMessages(
  db: Database,
  workspaceId: string,
  channelId: string,
  limit = 100,
): Promise<ChatMessageWithAuthor[]> {
  const rows = await db
    .select({
      id: chatMessages.id,
      channelId: chatMessages.channelId,
      authorId: chatMessages.authorId,
      authorName: users.name,
      authorEmail: users.email,
      body: chatMessages.body,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .leftJoin(users, eq(users.id, chatMessages.authorId))
    .where(
      and(eq(chatMessages.workspaceId, workspaceId), eq(chatMessages.channelId, channelId)),
    )
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit);
  return rows.reverse();
}

export interface PostMessageInput {
  workspaceId: string;
  channelId: string;
  authorId: string | null;
  body: string;
}

export async function postMessage(
  db: Database,
  input: PostMessageInput,
): Promise<ChatMessageWithAuthor> {
  const [row] = await db
    .insert(chatMessages)
    .values({
      workspaceId: input.workspaceId,
      channelId: input.channelId,
      authorId: input.authorId,
      body: input.body,
    })
    .returning({
      id: chatMessages.id,
      channelId: chatMessages.channelId,
      authorId: chatMessages.authorId,
      body: chatMessages.body,
      createdAt: chatMessages.createdAt,
    });
  if (!row) throw new Error("chat_message_insert_failed");
  return { ...row, authorName: null, authorEmail: null };
}
