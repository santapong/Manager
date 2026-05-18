import { withActiveWorkspace } from "@/src/lib/workspace-context";
import * as labelService from "@/src/server/labels";
import { LabelsManager } from "./labels-manager";

export const dynamic = "force-dynamic";

/**
 * Workspace-scoped tag/label manager. RSC fetches the labels and hands them
 * to a client component for inline CRUD.
 */
export default async function LabelsSettingsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const labels = await withActiveWorkspace(async (tx, ws) => labelService.list(tx, ws.id));
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Tags</h1>
        <p className="mt-1 text-sm text-gray-600">
          Workspace-scoped labels. Use these to tag tasks and projects.
        </p>
      </header>
      <LabelsManager
        workspaceSlug={slug}
        labels={labels.map((l) => ({ id: l.id, name: l.name, color: l.color }))}
      />
    </div>
  );
}
