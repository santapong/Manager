import Link from "next/link";
import { redirect } from "next/navigation";
import { dbNode } from "@manager/db";
import { findInviteByTokenHash, hashInviteToken } from "@manager/db/queries";
import { env } from "@/src/env";
import { auth } from "@/src/lib/auth";
import { acceptInviteAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Invite landing page. Middleware already bounces signed-out visitors to
 * /sign-in?next=/invite/{token}; by the time this renders there is a
 * session. The token is looked up by hash WITHOUT workspace context — the
 * invitee is not a member yet (see packages/db/src/queries/invites.ts).
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const svc = await auth();
  const session = await svc.getSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`);

  const db = dbNode(env.DATABASE_URL);
  const invite = await findInviteByTokenHash(db, hashInviteToken(token));

  if (!invite) {
    return (
      <Shell title="Invite not found">
        <p>This invite link is invalid or has been revoked. Ask a workspace admin for a new one.</p>
      </Shell>
    );
  }
  if (invite.acceptedAt) {
    return (
      <Shell title="Invite already used">
        <p>
          This invite to <span className="font-medium">{invite.workspaceName}</span> has already
          been accepted.{" "}
          <Link href={`/${invite.workspaceSlug}`} className="text-brand-600 hover:underline">
            Open the workspace
          </Link>{" "}
          if you're a member.
        </p>
      </Shell>
    );
  }
  if (invite.expiresAt < new Date()) {
    return (
      <Shell title="Invite expired">
        <p>
          This invite to <span className="font-medium">{invite.workspaceName}</span> expired on{" "}
          {invite.expiresAt.toISOString().slice(0, 10)}. Ask a workspace admin to send a new one.
        </p>
      </Shell>
    );
  }
  if (session.user.email.toLowerCase() !== invite.email) {
    return (
      <Shell title="Different account">
        <p>
          This invite was sent to <span className="font-mono">{invite.email}</span>, but you're
          signed in as <span className="font-mono">{session.user.email}</span>.
        </p>
        <form action="/api/auth/sign-out" method="post" className="mt-4">
          <button className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Sign out and switch account
          </button>
        </form>
      </Shell>
    );
  }

  const accept = acceptInviteAction.bind(null, token);
  return (
    <Shell title={`Join ${invite.workspaceName}`}>
      <p>
        You've been invited to join <span className="font-medium">{invite.workspaceName}</span> as{" "}
        <span className="font-mono text-sm">{invite.role}</span>.
      </p>
      <form action={accept} className="mt-6">
        <button className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          Accept invitation
        </button>
      </form>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto mt-24 max-w-md px-6">
      <h1 className="mb-3 text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="text-sm leading-6 text-gray-600">{children}</div>
    </main>
  );
}
