"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { dbNode } from "@manager/db";
import { acceptInvite, findInviteByTokenHash, hashInviteToken } from "@manager/db/queries";
import { env } from "@/src/env";
import { auth } from "@/src/lib/auth";
import { ACTIVE_WORKSPACE_COOKIE } from "@/src/lib/workspace-context";

/**
 * Accept an invite: re-validates everything the page checked (the row can
 * change between render and click), creates the membership, activates the
 * workspace, and lands the new member in it. Invalid states bounce back to
 * the invite page, which renders the precise error.
 */
export async function acceptInviteAction(token: string) {
  const svc = await auth();
  const session = await svc.requireSession();

  const db = dbNode(env.DATABASE_URL);
  const invite = await findInviteByTokenHash(db, hashInviteToken(token));
  if (
    !invite ||
    invite.acceptedAt ||
    invite.expiresAt < new Date() ||
    session.user.email.toLowerCase() !== invite.email
  ) {
    redirect(`/invite/${token}`);
  }

  const ws = await acceptInvite(db, { inviteId: invite.id, userId: session.user.id });

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, ws.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect(`/${ws.slug}`);
}
