import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Database } from "../client";
import { invites, memberships, workspaces, type Invite } from "../schema";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Same scheme as magic-link tokens (packages/auth/src/tokens.ts): random
// 32 bytes, only the SHA-256 hex stored at rest. Duplicated here because
// @manager/auth depends on @manager/db — importing it back would cycle.
export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface CreateInviteInput {
  workspaceId: string;
  email: string;
  role?: "admin" | "member" | "guest";
  invitedBy: string | null;
  ttlMs?: number;
}

/**
 * Create a pending invite. Returns the raw token exactly once — it is never
 * stored, only its hash. Throws on a duplicate pending invite for the same
 * email (partial unique index).
 */
export async function createInvite(
  db: Database,
  input: CreateInviteInput,
): Promise<{ invite: Invite; token: string }> {
  const token = generateInviteToken();
  const [invite] = await db
    .insert(invites)
    .values({
      workspaceId: input.workspaceId,
      email: input.email.toLowerCase(),
      role: input.role ?? "member",
      tokenHash: hashInviteToken(token),
      invitedBy: input.invitedBy,
      expiresAt: new Date(Date.now() + (input.ttlMs ?? INVITE_TTL_MS)),
    })
    .returning();
  if (!invite) throw new Error("invite_insert_failed");
  return { invite, token };
}

export async function listPendingInvites(db: Database, workspaceId: string): Promise<Invite[]> {
  return db
    .select()
    .from(invites)
    .where(and(eq(invites.workspaceId, workspaceId), isNull(invites.acceptedAt)))
    .orderBy(desc(invites.createdAt));
}

export async function revokeInvite(db: Database, workspaceId: string, id: string): Promise<void> {
  await db
    .delete(invites)
    .where(
      and(eq(invites.workspaceId, workspaceId), eq(invites.id, id), isNull(invites.acceptedAt)),
    );
}

export interface InviteWithWorkspace extends Invite {
  workspaceSlug: string;
  workspaceName: string;
}

/**
 * Token-hash lookup for the accept flow. Runs without workspace context —
 * the invitee is not a member yet, so this must go through `dbNode` outside
 * `withWorkspace()` (same precedent as session/verification-token lookups
 * and the /welcome onboarding inserts). Returns the row in any state; the
 * caller branches on expired/accepted.
 */
export async function findInviteByTokenHash(
  db: Database,
  tokenHash: string,
): Promise<InviteWithWorkspace | undefined> {
  const [row] = await db
    .select({
      id: invites.id,
      workspaceId: invites.workspaceId,
      email: invites.email,
      role: invites.role,
      tokenHash: invites.tokenHash,
      invitedBy: invites.invitedBy,
      expiresAt: invites.expiresAt,
      acceptedAt: invites.acceptedAt,
      createdAt: invites.createdAt,
      workspaceSlug: workspaces.slug,
      workspaceName: workspaces.name,
    })
    .from(invites)
    .innerJoin(workspaces, eq(invites.workspaceId, workspaces.id))
    .where(eq(invites.tokenHash, tokenHash))
    .limit(1);
  return row;
}

/**
 * Accept a pending invite: create the membership with the invited role and
 * mark the invite consumed, in one transaction. Idempotent on membership
 * (`onConflictDoNothing`) so re-inviting an existing member can't fail.
 */
export async function acceptInvite(
  db: Database,
  args: { inviteId: string; userId: string },
): Promise<{ id: string; slug: string }> {
  return db.transaction(async (tx) => {
    const [invite] = await tx
      .select()
      .from(invites)
      .where(eq(invites.id, args.inviteId))
      .for("update")
      .limit(1);
    if (!invite) throw new Error("invite_not_found");
    if (invite.acceptedAt) throw new Error("invite_already_accepted");
    if (invite.expiresAt < new Date()) throw new Error("invite_expired");

    await tx
      .insert(memberships)
      .values({ workspaceId: invite.workspaceId, userId: args.userId, role: invite.role })
      .onConflictDoNothing();
    await tx.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id));

    const [ws] = await tx
      .select({ id: workspaces.id, slug: workspaces.slug })
      .from(workspaces)
      .where(eq(workspaces.id, invite.workspaceId))
      .limit(1);
    if (!ws) throw new Error("workspace_not_found");
    return ws;
  });
}
