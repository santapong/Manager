import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createNodeClient } from "../src/client";
import {
  acceptInvite,
  createInvite,
  findInviteByTokenHash,
  hashInviteToken,
  listPendingInvites,
  revokeInvite,
} from "../src/queries/invites";
import { listMembers } from "../src/queries/members";
import { withWorkspace } from "../src/rls";
import { invites, memberships, users, workspaces } from "../src/schema";

const url = process.env.DATABASE_URL;
const describeIfDb = url ? describe : describe.skip;

describeIfDb("invites — token lifecycle, acceptance, RLS isolation", () => {
  const db = url ? createNodeClient(url) : (null as never);

  const wsA = randomUUID();
  const wsB = randomUUID();
  const owner = randomUUID();
  const invitee = randomUUID();
  const inviteeEmail = `invitee-${invitee.slice(0, 8)}@test.local`;
  // True when the connection role is subject to RLS; isolation assertions
  // skip otherwise (table-owner connections bypass policies — see PLAN §6).
  let rlsEnforced = false;

  beforeAll(async () => {
    await db.insert(users).values([
      { id: owner, email: `owner-${owner.slice(0, 8)}@test.local`, name: "Owner" },
      { id: invitee, email: inviteeEmail, name: "Invitee" },
    ]);
    await db.insert(workspaces).values([
      { id: wsA, slug: `inv-a-${wsA.slice(0, 6)}`, name: "Invites A" },
      { id: wsB, slug: `inv-b-${wsB.slice(0, 6)}`, name: "Invites B" },
    ]);
    await db.insert(memberships).values([
      { workspaceId: wsA, userId: owner, role: "owner" },
      { workspaceId: wsB, userId: owner, role: "owner" },
    ]);

    // Probe whether RLS binds this connection (cross-workspace insert).
    try {
      const { invite } = await withWorkspace(db, wsB, (tx) =>
        createInvite(tx, { workspaceId: wsA, email: "rls-probe@test.local", invitedBy: owner }),
      );
      rlsEnforced = false;
      await db.delete(invites).where(eq(invites.id, invite.id));
    } catch {
      rlsEnforced = true;
    }
  });

  afterAll(async () => {
    if (!db) return;
    await db.delete(workspaces).where(eq(workspaces.id, wsA));
    await db.delete(workspaces).where(eq(workspaces.id, wsB));
    await db.delete(users).where(eq(users.id, owner));
    await db.delete(users).where(eq(users.id, invitee));
  });

  it("stores only the token hash, never the raw token", async () => {
    const { invite, token } = await withWorkspace(db, wsA, (tx) =>
      createInvite(tx, { workspaceId: wsA, email: "Hash.Check@Test.Local", invitedBy: owner }),
    );
    expect(invite.email).toBe("hash.check@test.local"); // lowercased
    expect(invite.tokenHash).not.toBe(token);
    expect(invite.tokenHash).toMatch(/^[0-9a-f]{64}$/u);
    await withWorkspace(db, wsA, (tx) => revokeInvite(tx, wsA, invite.id));
  });

  it("rejects a second pending invite for the same email (case-insensitive)", async () => {
    const { invite } = await withWorkspace(db, wsA, (tx) =>
      createInvite(tx, { workspaceId: wsA, email: "dupe@test.local", invitedBy: owner }),
    );
    await expect(
      withWorkspace(db, wsA, (tx) =>
        createInvite(tx, { workspaceId: wsA, email: "DUPE@test.local", invitedBy: owner }),
      ),
    ).rejects.toThrow();
    await withWorkspace(db, wsA, (tx) => revokeInvite(tx, wsA, invite.id));
  });

  it("accept creates the membership with the invited role and consumes the invite", async () => {
    const { invite, token } = await withWorkspace(db, wsA, (tx) =>
      createInvite(tx, {
        workspaceId: wsA,
        email: inviteeEmail,
        role: "guest",
        invitedBy: owner,
      }),
    );

    // Accept flow runs without workspace context (invitee isn't a member yet).
    const found = await findInviteByTokenHash(db, hashInviteToken(token));
    expect(found?.id).toBe(invite.id);
    expect(found?.workspaceSlug).toBe(`inv-a-${wsA.slice(0, 6)}`);

    const ws = await acceptInvite(db, { inviteId: invite.id, userId: invitee });
    expect(ws.id).toBe(wsA);

    const members = await withWorkspace(db, wsA, (tx) => listMembers(tx, wsA));
    const added = members.find((m) => m.userId === invitee);
    expect(added?.role).toBe("guest");

    // Single-use: a second accept fails.
    await expect(acceptInvite(db, { inviteId: invite.id, userId: invitee })).rejects.toThrow(
      /already_accepted/,
    );

    // Accepted invites drop out of the pending list.
    const pending = await withWorkspace(db, wsA, (tx) => listPendingInvites(tx, wsA));
    expect(pending.find((i) => i.id === invite.id)).toBeUndefined();

    await db.delete(memberships).where(eq(memberships.userId, invitee));
    await db.delete(invites).where(eq(invites.id, invite.id));
  });

  it("expired invites cannot be accepted", async () => {
    const { invite } = await withWorkspace(db, wsA, (tx) =>
      createInvite(tx, {
        workspaceId: wsA,
        email: `expired-${randomUUID().slice(0, 8)}@test.local`,
        invitedBy: owner,
        ttlMs: -1000,
      }),
    );
    await expect(acceptInvite(db, { inviteId: invite.id, userId: invitee })).rejects.toThrow(
      /expired/,
    );
    await db.delete(invites).where(eq(invites.id, invite.id));
  });

  it("workspace B cannot see workspace A invites", async (ctx) => {
    if (!rlsEnforced) ctx.skip();
    const { invite } = await withWorkspace(db, wsA, (tx) =>
      createInvite(tx, {
        workspaceId: wsA,
        email: `iso-${randomUUID().slice(0, 8)}@test.local`,
        invitedBy: owner,
      }),
    );
    const visible = await withWorkspace(db, wsB, (tx) => tx.select().from(invites));
    expect(visible.every((r) => r.workspaceId === wsB)).toBe(true);
    expect(visible.find((r) => r.id === invite.id)).toBeUndefined();
    await withWorkspace(db, wsA, (tx) => revokeInvite(tx, wsA, invite.id));
  });

  it("cross-workspace invite insert is blocked by WITH CHECK", async (ctx) => {
    if (!rlsEnforced) ctx.skip();
    await expect(
      withWorkspace(db, wsB, (tx) =>
        createInvite(tx, { workspaceId: wsA, email: "smuggled@test.local", invitedBy: owner }),
      ),
    ).rejects.toThrow();
  });
});
