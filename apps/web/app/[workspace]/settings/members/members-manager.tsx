"use client";

// Client component — members list, pending invites, and the invite form.
// After a successful invite the raw link is shown once (with copy) so it
// can be shared even when email isn't configured (console adapter in dev).

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { inviteMemberAction, revokeInviteAction } from "../../_actions/members";

type Member = {
  userId: string;
  email: string;
  name: string | null;
  role: "owner" | "admin" | "member" | "guest";
};
type PendingInvite = { id: string; email: string; role: string; expiresAt: string };
type InviteState = { ok?: true; error?: string; inviteUrl?: string; email?: string };

const ROLE_BADGE: Record<Member["role"], string> = {
  owner: "bg-violet-100 text-violet-700",
  admin: "bg-sky-100 text-sky-700",
  member: "bg-gray-100 text-gray-600",
  guest: "bg-amber-100 text-amber-700",
};

export function MembersManager({
  workspaceSlug,
  canManage,
  members,
  invites,
}: {
  workspaceSlug: string;
  canManage: boolean;
  members: Member[];
  invites: PendingInvite[];
}) {
  return (
    <div className="space-y-6">
      {canManage ? <InviteForm workspaceSlug={workspaceSlug} /> : null}

      <ul className="divide-y divide-gray-200 rounded-md border border-gray-200">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700 ring-1 ring-gray-300">
              {(m.name ?? m.email).slice(0, 2).toUpperCase()}
            </span>
            <span className="flex-1 truncate">
              {m.name ? <span className="font-medium">{m.name}</span> : null}
              <span className={m.name ? "ml-2 text-gray-500" : ""}>{m.email}</span>
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BADGE[m.role]}`}
            >
              {m.role}
            </span>
          </li>
        ))}
      </ul>

      {invites.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-medium text-gray-700">Pending invites</h2>
          <ul className="divide-y divide-gray-200 rounded-md border border-dashed border-gray-300">
            {invites.map((i) => (
              <PendingInviteRow
                key={i.id}
                workspaceSlug={workspaceSlug}
                invite={i}
                canManage={canManage}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function InviteForm({ workspaceSlug }: { workspaceSlug: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const bound = inviteMemberAction.bind(null, workspaceSlug);
  const [state, action, pending] = useActionState<InviteState, FormData>(bound, {});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
    setCopied(false);
  }, [state]);

  return (
    <div className="space-y-3 rounded-md border border-gray-200 p-4">
      <form ref={formRef} action={action} className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <label htmlFor="inv-email" className="mb-1 block text-sm font-medium text-gray-700">
            Invite by email
          </label>
          <input
            id="inv-email"
            name="email"
            type="email"
            required
            placeholder="teammate@example.com"
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div>
          <label htmlFor="inv-role" className="mb-1 block text-sm font-medium text-gray-700">
            Role
          </label>
          <select
            id="inv-role"
            name="role"
            defaultValue="member"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="admin">admin</option>
            <option value="member">member</option>
            <option value="guest">guest</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "Inviting…" : "Send invite"}
        </button>
      </form>

      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}

      {state.ok && state.inviteUrl ? (
        <div className="space-y-2 rounded-md bg-gray-50 p-3 text-sm">
          <p>
            Invite sent to <span className="font-mono">{state.email}</span>. You can also share
            the link directly:
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={state.inviteUrl}
              aria-label="Invite link"
              onFocus={(e) => e.target.select()}
              className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 font-mono text-xs"
            />
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(state.inviteUrl!);
                setCopied(true);
              }}
              className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
            >
              {copied ? "Copied!" : "Copy link"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PendingInviteRow({
  workspaceSlug,
  invite,
  canManage,
}: {
  workspaceSlug: string;
  invite: PendingInvite;
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function revoke() {
    startTransition(async () => {
      const fd = new FormData();
      fd.append("id", invite.id);
      await revokeInviteAction(workspaceSlug, fd);
    });
  }

  return (
    <li
      className={`flex items-center gap-3 px-4 py-2.5 text-sm ${pending ? "opacity-60" : ""}`}
    >
      <span className="flex-1 truncate font-mono text-xs">{invite.email}</span>
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
        {invite.role}
      </span>
      <span className="text-xs text-gray-400">expires {invite.expiresAt}</span>
      {canManage ? (
        <button
          type="button"
          onClick={revoke}
          disabled={pending}
          className="text-xs text-gray-400 hover:text-red-600"
        >
          revoke
        </button>
      ) : null}
    </li>
  );
}
