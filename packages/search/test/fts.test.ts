import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createNodeClient,
  lists,
  memberships,
  projects,
  tasks,
  users,
  withWorkspace,
  workspaces,
} from "@manager/db";
import { createPostgresFtsSearchService } from "../src/postgres-fts-adapter";

const url = process.env.DATABASE_URL;
const describeIfDb = url ? describe : describe.skip;

describeIfDb("Postgres FTS search adapter", () => {
  const db = url ? createNodeClient(url) : (null as never);
  const svc = url ? createPostgresFtsSearchService(db) : (null as never);

  const wsA = randomUUID();
  const wsB = randomUUID();
  const user = randomUUID();
  let projectId = "";

  beforeAll(async () => {
    await db
      .insert(users)
      .values({ id: user, email: `fts-${user.slice(0, 8)}@test.local`, name: "FTS" });
    await db.insert(workspaces).values([
      { id: wsA, slug: `fts-a-${wsA.slice(0, 6)}`, name: "FTS A" },
      { id: wsB, slug: `fts-b-${wsB.slice(0, 6)}`, name: "FTS B" },
    ]);
    await db.insert(memberships).values([{ workspaceId: wsA, userId: user, role: "owner" }]);

    await withWorkspace(db, wsA, async (tx) => {
      const [p] = await tx
        .insert(projects)
        .values({ workspaceId: wsA, key: "FTS", name: "Search", createdBy: user })
        .returning();
      if (!p) throw new Error("seed failed");
      projectId = p.id;
      const [l] = await tx
        .insert(lists)
        .values({ workspaceId: wsA, projectId, name: "todo", position: 0 })
        .returning();
      if (!l) throw new Error("seed failed");
      await tx.insert(tasks).values([
        {
          workspaceId: wsA,
          projectId,
          listId: l.id,
          key: "FTS-1",
          title: "Deploy the staging environment",
          description: "Wire the kubernetes manifests for staging.",
        },
        {
          workspaceId: wsA,
          projectId,
          listId: l.id,
          key: "FTS-2",
          title: "Fix login redirect loop",
          description: null,
        },
      ]);
    });
  });

  afterAll(async () => {
    if (!db) return;
    await db.delete(workspaces).where(eq(workspaces.id, wsA));
    await db.delete(workspaces).where(eq(workspaces.id, wsB));
    await db.delete(users).where(eq(users.id, user));
  });

  it("matches title words, ranked, with project key attached", async () => {
    const hits = await svc.search(wsA, "staging");
    expect(hits.length).toBe(1);
    expect(hits[0]?.key).toBe("FTS-1");
    expect(hits[0]?.projectKey).toBe("FTS");
    expect(hits[0]?.rank).toBeGreaterThan(0);
  });

  it("title-only words match with consistent stemming (no description)", async () => {
    // FTS-2 has no description — "redirect" must match via the title vector.
    const hits = await svc.search(wsA, "redirect");
    expect(hits.map((h) => h.key)).toEqual(["FTS-2"]);
    const stemmed = await svc.search(wsA, "redirects"); // english stems to the same lexeme
    expect(stemmed.map((h) => h.key)).toEqual(["FTS-2"]);
  });

  it("matches description words (weight B)", async () => {
    const hits = await svc.search(wsA, "kubernetes");
    expect(hits.map((h) => h.key)).toEqual(["FTS-1"]);
  });

  it("key prefix jumps work (FTS-2)", async () => {
    const hits = await svc.search(wsA, "FTS-2");
    expect(hits.map((h) => h.key)).toContain("FTS-2");
  });

  it("scopes to the workspace", async () => {
    const hits = await svc.search(wsB, "staging");
    expect(hits).toEqual([]);
  });

  it("empty query returns nothing", async () => {
    expect(await svc.search(wsA, "  ")).toEqual([]);
  });
});
