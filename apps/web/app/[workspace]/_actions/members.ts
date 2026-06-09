"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { logger } from "@manager/observability";
import { memberships, users } from "@manager/db";
import { createInvite, revokeInvite, INVITE_TTL_MS } from "@manager/db/queries";
import { inviteEmail } from "@manager/email";
import { auth } from "@/src/lib/auth";
import { emailService } from "@/src/lib/email";
import { env } from "@/src/env";
import { CreateInviteSchema, RevokeInviteSchema } from "@/src/lib/validators/invite";
import { withActiveWorkspace } from "@/src/lib/workspace-context";

/**
 * Invite someone to the active workspace by email. Owner/admin only.
 * The invite row (hashed token) is written in the workspace transaction;
 * the email is sent best-effort afterwards — a mail outage must not lose
 * the invite, and the returned link can always be shared manually.
 */
export async function inviteMemberAction(slug: string, _prev: unknown, formData: FormData) {
  const parsed = CreateInviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const svc = await auth();
  const session = await svc.requireSession();
  const email = parsed.data.email.toLowerCase();

  const result = await withActiveWorkspace(async (tx, ws) => {
    if (ws.role !== "owner" && ws.role !== "admin") {
      return { error: "Only owners and admins can invite members." };
    }
    const [existing] = await tx
      .select({ userId: memberships.userId })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(and(eq(memberships.workspaceId, ws.id), eq(users.email, email)))
      .limit(1);
    if (existing) return { error: `${email} is already a member of this workspace.` };

    try {
      const { token } = await createInvite(tx, {
        workspaceId: ws.id,
        email,
        role: parsed.data.role,
        invitedBy: session.user.id,
      });
      return { ok: true as const, token, workspaceName: ws.name };
    } catch (e) {
      if (e instanceof Error && /unique|duplicate/i.test(e.message)) {
        return { error: `An invite for ${email} is already pending.` };
      }
      throw e;
    }
  });

  if ("error" in result) return { error: result.error };

  const inviteUrl = `${env.NEXT_PUBLIC_APP_URL}/invite/${result.token}`;
  try {
    const { text, html } = inviteEmail({
      workspaceName: result.workspaceName,
      invitedByEmail: session.user.email,
      url: inviteUrl,
      expiresInDays: Math.round(INVITE_TTL_MS / 86_400_000),
    });
    await emailService().send({
      to: email,
      subject: `You're invited to ${result.workspaceName} on Manager`,
      text,
      html,
      tags: { kind: "workspace_invite" },
    });
  } catch (e) {
    logger.error("invite_email_failed", { email, error: e instanceof Error ? e.message : String(e) });
  }

  revalidatePath(`/${slug}/settings/members`);
  return { ok: true as const, inviteUrl, email };
}

export async function revokeInviteAction(slug: string, formData: FormData) {
  const parsed = RevokeInviteSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const result = await withActiveWorkspace(async (tx, ws) => {
    if (ws.role !== "owner" && ws.role !== "admin") {
      return { error: "Only owners and admins can revoke invites." };
    }
    await revokeInvite(tx, ws.id, parsed.data.id);
    return { ok: true as const };
  });

  if ("error" in result) return { error: result.error };
  revalidatePath(`/${slug}/settings/members`);
  return { ok: true as const };
}
