import { withActiveWorkspace } from "@/src/lib/workspace-context";
import { listConnections } from "@/src/server/github";
import { env } from "@/src/env";
import { GithubManager } from "./github-manager";

export const dynamic = "force-dynamic";

/**
 * GitHub integration settings. Connect a repo and its inbound webhook drives
 * task status from PRs/branches (matched by task key). RSC loads the
 * connections; the webhook URL is derived from the app's public URL.
 */
export default async function GithubSettingsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const connections = await withActiveWorkspace(async (tx, ws) => listConnections(tx, ws.id));
  const webhookUrl = `${env.NEXT_PUBLIC_APP_URL}/api/webhooks/github`;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">GitHub</h1>
        <p className="mt-1 text-sm text-gray-600">
          Connect a repository so pull requests automatically link to tasks by key (e.g.{" "}
          <span className="font-mono">ABC-123</span>) and drive their status.
        </p>
      </header>
      <GithubManager
        workspaceSlug={slug}
        webhookUrl={webhookUrl}
        connections={connections.map((c) => ({
          id: c.id,
          owner: c.owner,
          repo: c.repo,
          webhookSecret: c.webhookSecret,
        }))}
      />
    </div>
  );
}
