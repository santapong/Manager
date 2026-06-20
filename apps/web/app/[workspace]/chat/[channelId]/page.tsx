import { notFound } from "next/navigation";
import { auth } from "@/src/lib/auth";
import { withActiveWorkspace } from "@/src/lib/workspace-context";
import { getChannel, listChannels, listMessages } from "@/src/server/chat";
import { ChannelList } from "../new-channel";
import { ChatRoom, type ChatRoomMessage } from "../chat-room";

export const dynamic = "force-dynamic";

/**
 * A single channel's conversation (Wave 3): the channel rail plus the live
 * ChatRoom. `notFound()` when the channel isn't in the active workspace.
 */
export default async function ChannelPage({
  params,
}: {
  params: Promise<{ workspace: string; channelId: string }>;
}) {
  const { workspace: slug, channelId } = await params;

  const svc = await auth();
  const session = await svc.requireSession();

  const data = await withActiveWorkspace(async (tx, ws) => {
    const channel = await getChannel(tx, ws.id, channelId);
    if (!channel) return null;
    const [channels, messages] = await Promise.all([
      listChannels(tx, ws.id),
      listMessages(tx, ws.id, channelId),
    ]);
    return { wsId: ws.id, channel, channels, messages };
  });

  if (!data) notFound();

  const { wsId, channel, channels, messages } = data;
  const initialMessages: ChatRoomMessage[] = messages.map((m) => ({
    id: m.id,
    authorId: m.authorId,
    authorName: m.authorName,
    authorEmail: m.authorEmail,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
  }));

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <ChannelList
        slug={slug}
        channels={channels.map((c) => ({ id: c.id, name: c.name }))}
        activeId={channel.id}
      />
      <ChatRoom
        slug={slug}
        wsId={wsId}
        channelId={channel.id}
        channelName={channel.name}
        currentUserId={session.user.id}
        currentUserName={session.user.name ?? session.user.email}
        initialMessages={initialMessages}
      />
    </div>
  );
}
