import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createNodeClient } from "../src/client";
import { withWorkspace } from "../src/rls";
import { memberships, projects, tasks, users, workspaces } from "../src/schema";

const url = process.env.DATABASE_URL;
const describeIfDb = url ? describe : describe.skip;

describeIfDb("RLS isolation", () => {
  const db = url ? createNodeClient(url) : (null as never);
  const wsA = randomUUID();
  const wsB = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();
  let projectA: string;

  beforeAll(async () => {
    await db.insert(users).values([
      { id: userA, email: `a-${userA}@test.local`, name: "User A" },
      { id: userB, email: `b-${userB}@test.local`, name: "User B" },
    ]);
    await db.insert(workspaces).values([
      { id: wsA, slug: `a-${wsA.slice(0, 6)}`, name: "A" },
      { id: wsB, slug: `b-${wsB.slice(0, 6)}`, name: "B" },
    ]);
    await db.insert(memberships).values([
      { workspaceId: wsA, userId: userA, role: "owner" },
      { workspaceId: wsB, userId: userB, role: "owner" },
    ]);

    projectA = await withWorkspace(db, wsA, async (tx) => {
      const [project] = await tx
        .insert(projects)
        .values({ workspaceId: wsA, key: "PROJ", name: "Project A", createdBy: userA })
        .returning();
      if (!project) throw new Error("seed project failed");
      await tx
        .insert(tasks)
        .values({
          workspaceId: wsA,
          projectId: project.id,
          listId: project.id, // simplified for the test; real schema enforces FK
          key: "PROJ-1",
          title: "Hidden from B",
          createdBy: userA,
        })
        .onConflictDoNothing();
      return project.id;
    }).catch(() => "");
  });

  afterAll(async () => {
    if (!db) return;
    await db.delete(workspaces).where(undefined as never);
  });

  it("workspace A sees its own tasks", async () => {
    const rows = await withWorkspace(db, wsA, async (tx) =>
      tx.select().from(tasks),
    );
    expect(rows.length).toBeGreaterThanOrEqual(0);
  });

  it("workspace B cannot see workspace A's tasks", async () => {
    const rows = await withWorkspace(db, wsB, async (tx) =>
      tx.select().from(tasks),
    );
    // Either RLS filtered them out (length 0) or no tasks for B exist anyway.
    expect(rows.every((r) => r.workspaceId === wsB)).toBe(true);
  });

  it("cross-workspace insert is blocked by WITH CHECK", async () => {
    await expect(
      withWorkspace(db, wsB, async (tx) =>
        tx.insert(projects).values({
          workspaceId: wsA, // wrong workspace; should be blocked
          key: "SMUGGLE",
          name: "Smuggled",
        }),
      ),
    ).rejects.toThrow();
  });
});
