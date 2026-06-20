import Link from "next/link";
import { withActiveWorkspace } from "@/src/lib/workspace-context";
import { aiEncryptionConfigured } from "@/src/lib/ai/crypto";
import { hasKey } from "@/src/server/ai-keys";
import { AssistantChat } from "./chat";

export const dynamic = "force-dynamic";

/**
 * AI assistant chat (Wave 2b). Requires both server-side encryption to be
 * configured AND a per-workspace key to be set; otherwise we render a friendly
 * empty state pointing at Settings → AI rather than a dead chat box. The
 * streaming + tool execution all happens in /api/ai/chat — this page only
 * gates and mounts the client UI.
 */
export default async function AssistantPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const encryptionConfigured = aiEncryptionConfigured();
  const keySet = encryptionConfigured
    ? await withActiveWorkspace((tx, ws) => hasKey(tx, ws.id))
    : false;

  if (!encryptionConfigured || !keySet) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-xl font-semibold tracking-tight">Assistant</h1>
          <p className="mt-1 text-sm text-gray-600">
            Chat with an assistant that can read this workspace&apos;s projects, tasks, and sprints.
          </p>
        </header>
        <div className="rounded-md border border-dashed border-gray-300 p-8 text-center">
          <p className="text-sm font-medium text-gray-900">The assistant isn&apos;t set up yet.</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
            {encryptionConfigured
              ? "Add an Anthropic API key for this workspace to start chatting."
              : "A platform admin must configure AI on this server before the assistant can be used."}
          </p>
          {encryptionConfigured ? (
            <Link
              href={`/${slug}/settings/ai`}
              className="mt-4 inline-flex rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              Go to AI settings
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col space-y-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Assistant</h1>
        <p className="mt-1 text-sm text-gray-600">
          Ask about your projects, tasks, and sprints. The assistant looks up real data before
          answering.
        </p>
      </header>
      <AssistantChat slug={slug} />
    </div>
  );
}
