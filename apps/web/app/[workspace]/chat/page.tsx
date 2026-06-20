import { redirect } from "next/navigation";
import { withActiveWorkspace } from "@/src/lib/workspace-context";
import { listChannels } from "@/src/server/chat";
import { NewChannel } from "./new-channel";

export const dynamic = "force-dynamic";

/**
 * Chat home (Wave 3): channel list + create. With existing channels we redirect
 * to the first so the workspace always lands on a conversation; with none, an
 * empty state prompts creation.
 */
export default async function ChatPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const channels = await withActiveWorkspace(async (tx, ws) => listChannels(tx, ws.id));

  if (channels.length > 0) {
    redirect(`/${slug}/chat/${channels[0]!.id}`);
  }

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <aside className="w-full shrink-0 space-y-3 md:w-64">
        <header>
          <h1 className="text-xl font-semibold tracking-tight">Chat</h1>
          <p className="mt-1 text-sm text-gray-600">Workspace channels.</p>
        </header>
        <NewChannel slug={slug} />
      </aside>

      <div className="flex-1">
        <p className="rounded-md border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          No channels yet. Create one to start chatting with your team.
        </p>
      </div>
    </div>
  );
}
