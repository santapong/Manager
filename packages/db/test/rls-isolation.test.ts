import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createNodeClient } from "../src/client";
import { wouldCreateCycle } from "../src/queries/links";
import { withWorkspace } from "../src/rls";
import {
  labels,
  lists,
  memberships,
  milestones,
  projectLabels,
  projectLinks,
  projects,
  subtasks,
  taskLabels,
  taskLinks,
  tasks,
  users,
  workspaces,
} from "../src/schema";

const url = process.env.DATABASE_URL;
const describeIfDb = url ? describe : describe.skip;

describeIfDb("RLS isolation — milestones, labels, links, subtasks", () => {
  const db = url ? createNodeClient(url) : (null as never);

  const wsA = randomUUID();
  const wsB = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();

  let projectA = "";
  let projectB = "";
  let listA = "";
  let listB = "";
  let taskA1 = "";
  let taskA2 = "";
  let taskA3 = "";
  let milestoneA = "";
  let labelA = "";

  beforeAll(async () => {
    await db.insert(users).values([
      { id: userA, email: `iso-a-${userA}@test.local`, name: "Iso A" },
      { id: userB, email: `iso-b-${userB}@test.local`, name: "Iso B" },
    ]);
    await db.insert(workspaces).values([
      { id: wsA, slug: `iso-a-${wsA.slice(0, 6)}`, name: "Iso A" },
      { id: wsB, slug: `iso-b-${wsB.slice(0, 6)}`, name: "Iso B" },
    ]);
    await db.insert(memberships).values([
      { workspaceId: wsA, userId: userA, role: "owner" },
      { workspaceId: wsB, userId: userB, role: "owner" },
    ]);

    // Seed workspace A
    await withWorkspace(db, wsA, async (tx) => {
      const [p] = await tx
        .insert(projects)
        .values({ workspaceId: wsA, key: "ISA", name: "Iso A Project", createdBy: userA })
        .returning();
      if (!p) throw new Error("seed project A failed");
      projectA = p.id;

      const [l] = await tx
        .insert(lists)
        .values({ workspaceId: wsA, projectId: projectA, name: "todo", position: 0 })
        .returning();
      if (!l) throw new Error("seed list A failed");
      listA = l.id;

      const [m] = await tx
        .insert(milestones)
        .values({ workspaceId: wsA, projectId: projectA, name: "MA-1", position: 0 })
        .returning();
      if (!m) throw new Error("seed milestone failed");
      milestoneA = m.id;

      const [lab] = await tx
        .insert(labels)
        .values({ workspaceId: wsA, name: "backend", color: "#0a0" })
        .returning();
      if (!lab) throw new Error("seed label failed");
      labelA = lab.id;

      const [t1] = await tx
        .insert(tasks)
        .values({
          workspaceId: wsA,
          projectId: projectA,
          listId: listA,
          key: "ISA-1",
          title: "T1",
          createdBy: userA,
          milestoneId: milestoneA,
        })
        .returning();
      const [t2] = await tx
        .insert(tasks)
        .values({
          workspaceId: wsA,
          projectId: projectA,
          listId: listA,
          key: "ISA-2",
          title: "T2",
          createdBy: userA,
        })
        .returning();
      const [t3] = await tx
        .insert(tasks)
        .values({
          workspaceId: wsA,
          projectId: projectA,
          listId: listA,
          key: "ISA-3",
          title: "T3",
          createdBy: userA,
        })
        .returning();
      if (!t1 || !t2 || !t3) throw new Error("seed tasks failed");
      taskA1 = t1.id;
      taskA2 = t2.id;
      taskA3 = t3.id;

      await tx.insert(taskLabels).values({ taskId: taskA1, labelId: labelA });
      await tx.insert(projectLabels).values({ projectId: projectA, labelId: labelA });
      await tx
        .insert(subtasks)
        .values({ workspaceId: wsA, taskId: taskA1, title: "step 1", position: 0 });

      // task A1 blocks A2 blocks A3
      await tx
        .insert(taskLinks)
        .values({ workspaceId: wsA, fromTaskId: taskA1, toTaskId: taskA2, type: "blocks" });
      await tx
        .insert(taskLinks)
        .values({ workspaceId: wsA, fromTaskId: taskA2, toTaskId: taskA3, type: "blocks" });
    });

    // Seed workspace B (separate project for project_links test)
    await withWorkspace(db, wsB, async (tx) => {
      const [p] = await tx
        .insert(projects)
        .values({ workspaceId: wsB, key: "ISB", name: "Iso B Project", createdBy: userB })
        .returning();
      if (!p) throw new Error("seed project B failed");
      projectB = p.id;

      const [l] = await tx
        .insert(lists)
        .values({ workspaceId: wsB, projectId: projectB, name: "todo", position: 0 })
        .returning();
      if (!l) throw new Error("seed list B failed");
      listB = l.id;
    });
  });

  afterAll(async () => {
    if (!db) return;
    // Cascade via workspaces.
    await db.delete(workspaces).where(eq(workspaces.id, wsA));
    await db.delete(workspaces).where(eq(workspaces.id, wsB));
    await db.delete(users).where(eq(users.id, userA));
    await db.delete(users).where(eq(users.id, userB));
  });

  it("workspace B cannot see workspace A milestones", async () => {
    const rows = await withWorkspace(db, wsB, async (tx) => tx.select().from(milestones));
    expect(rows.every((r) => r.workspaceId === wsB)).toBe(true);
    expect(rows.find((r) => r.id === milestoneA)).toBeUndefined();
  });

  it("workspace B cannot see workspace A labels", async () => {
    const rows = await withWorkspace(db, wsB, async (tx) => tx.select().from(labels));
    expect(rows.every((r) => r.workspaceId === wsB)).toBe(true);
    expect(rows.find((r) => r.id === labelA)).toBeUndefined();
  });

  it("workspace B cannot see workspace A task_links", async () => {
    const rows = await withWorkspace(db, wsB, async (tx) => tx.select().from(taskLinks));
    expect(rows.every((r) => r.workspaceId === wsB)).toBe(true);
  });

  it("workspace B cannot see workspace A subtasks", async () => {
    const rows = await withWorkspace(db, wsB, async (tx) => tx.select().from(subtasks));
    expect(rows.every((r) => r.workspaceId === wsB)).toBe(true);
  });

  it("workspace B cannot see workspace A task_labels join rows", async () => {
    const rows = await withWorkspace(db, wsB, async (tx) => tx.select().from(taskLabels));
    expect(rows.length).toBe(0);
  });

  it("workspace B cannot see workspace A project_labels join rows", async () => {
    const rows = await withWorkspace(db, wsB, async (tx) => tx.select().from(projectLabels));
    expect(rows.length).toBe(0);
  });

  it("cross-workspace milestone insert is blocked by WITH CHECK", async () => {
    await expect(
      withWorkspace(db, wsB, async (tx) =>
        tx.insert(milestones).values({
          workspaceId: wsA, // smuggling attempt
          projectId: projectA,
          name: "smuggled",
        }),
      ),
    ).rejects.toThrow();
  });

  it("cross-workspace label insert is blocked by WITH CHECK", async () => {
    await expect(
      withWorkspace(db, wsB, async (tx) =>
        tx.insert(labels).values({ workspaceId: wsA, name: "smuggled" }),
      ),
    ).rejects.toThrow();
  });

  it("cross-workspace subtask insert is blocked by WITH CHECK", async () => {
    await expect(
      withWorkspace(db, wsB, async (tx) =>
        tx.insert(subtasks).values({ workspaceId: wsA, taskId: taskA1, title: "smuggled" }),
      ),
    ).rejects.toThrow();
  });

  it("labels: case-insensitive uniqueness per workspace", async () => {
    await expect(
      withWorkspace(db, wsA, async (tx) =>
        tx.insert(labels).values({ workspaceId: wsA, name: "BACKEND" }),
      ),
    ).rejects.toThrow();
  });

  it("task_links: self-link rejected by CHECK", async () => {
    await expect(
      withWorkspace(db, wsA, async (tx) =>
        tx.insert(taskLinks).values({
          workspaceId: wsA,
          fromTaskId: taskA1,
          toTaskId: taskA1,
          type: "blocks",
        }),
      ),
    ).rejects.toThrow();
  });

  it("task_links: duplicate (from,to,type) rejected by UNIQUE", async () => {
    await expect(
      withWorkspace(db, wsA, async (tx) =>
        tx.insert(taskLinks).values({
          workspaceId: wsA,
          fromTaskId: taskA1,
          toTaskId: taskA2,
          type: "blocks",
        }),
      ),
    ).rejects.toThrow();
  });

  it("wouldCreateCycle: detects direct back-edge", async () => {
    // A1 -> A2 -> A3 already. Adding A3 -> A1 closes a cycle.
    const result = await withWorkspace(db, wsA, async (tx) =>
      wouldCreateCycle(tx, taskA3, taskA1, "task_blocks"),
    );
    expect(result).toBe(true);
  });

  it("wouldCreateCycle: returns false when no path exists", async () => {
    // A3 -> (nothing back to A2 yet). Going A1 -> A3 is forward-only.
    const result = await withWorkspace(db, wsA, async (tx) =>
      wouldCreateCycle(tx, taskA1, taskA3, "task_blocks"),
    );
    expect(result).toBe(false);
  });

  it("wouldCreateCycle: self-edge is a cycle without hitting DB", async () => {
    const result = await withWorkspace(db, wsA, async (tx) =>
      wouldCreateCycle(tx, taskA1, taskA1, "task_blocks"),
    );
    expect(result).toBe(true);
  });

  it("wouldCreateCycle: project_depends detects cycle through chain", async () => {
    // Build a B-side project chain p1 -> p2 -> p3, then check adding p3 -> p1.
    const p1 = projectB;
    let p2 = "";
    let p3 = "";
    await withWorkspace(db, wsB, async (tx) => {
      const [pp2] = await tx
        .insert(projects)
        .values({ workspaceId: wsB, key: "ISBX", name: "P2", createdBy: userB })
        .returning();
      const [pp3] = await tx
        .insert(projects)
        .values({ workspaceId: wsB, key: "ISBY", name: "P3", createdBy: userB })
        .returning();
      if (!pp2 || !pp3) throw new Error("seed extra projects failed");
      p2 = pp2.id;
      p3 = pp3.id;
      await tx
        .insert(projectLinks)
        .values({ workspaceId: wsB, fromProjectId: p1, toProjectId: p2, type: "depends_on" });
      await tx
        .insert(projectLinks)
        .values({ workspaceId: wsB, fromProjectId: p2, toProjectId: p3, type: "depends_on" });
    });

    const closes = await withWorkspace(db, wsB, async (tx) =>
      wouldCreateCycle(tx, p3, p1, "project_depends"),
    );
    expect(closes).toBe(true);

    const safe = await withWorkspace(db, wsB, async (tx) =>
      wouldCreateCycle(tx, p1, p3, "project_depends"),
    );
    // Forward edge p1 -> p3 with existing p1 -> p2 -> p3: no cycle.
    expect(safe).toBe(false);
  });

  // Unused but kept so unused-import lint stays clean if listB is referenced
  // in future expansions.
  it("seed lists are addressable", () => {
    expect(listA).not.toBe("");
    expect(listB).not.toBe("");
  });
});
