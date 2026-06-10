import { listMembers, listPendingInvites } from "@manager/db/queries";
import { withActiveWorkspace } from "@/src/lib/workspace-context";
import { MembersManager } from "./members-manager";

export const dynamic = "force-dynamic";

/**
 * Workspace members + pending invites. RSC fetches both and hands them to
 * a client component; invite/revoke are owner/admin-only (enforced in the
 * Server Actions, mirrored in the UI).
 */
export default async function MembersSettingsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const data = await withActiveWorkspace(async (tx, ws) => ({
    members: await listMembers(tx, ws.id),
    invites: await listPendingInvites(tx, ws.id),
    role: ws.role,
  }));
  const canManage = data.role === "owner" || data.role === "admin";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Members</h1>
        <p className="mt-1 text-sm text-gray-600">
          People with access to this workspace. Invites expire after 7 days.
        </p>
      </header>
      <MembersManager
        workspaceSlug={slug}
        canManage={canManage}
        members={data.members.map((m) => ({
          userId: m.userId,
          email: m.email,
          name: m.name,
          role: m.role,
        }))}
        invites={data.invites.map((i) => ({
          id: i.id,
          email: i.email,
          role: i.role,
          expiresAt: i.expiresAt.toISOString().slice(0, 10),
        }))}
      />
    </div>
  );
}
