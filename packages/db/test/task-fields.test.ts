import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createNodeClient } from "../src/client";
import { createTask, updateTask } from "../src/queries/tasks";
import { withWorkspace } from "../src/rls";
import { lists, memberships, projects, users, workspaces } from "../src/schema";

const url = process.env.DATABASE_URL;
const describeIfDb = url ? describe : describe.skip;

describeIfDb("tasks — assignee / dueAt / type / points updates", () => {
  const db = url ? createNodeClient(url) : (null as never);

  const ws = randomUUID();
  const user = randomUUID();
  let projectId = "";
  let listId = "";
  let taskId = "";

  beforeAll(async () => {
    await db
      .insert(users)
      .values({ id: user, email: `fields-${user.slice(0, 8)}@test.local`, name: "Fields" });
    await db.insert(workspaces).values({ id: ws, slug: `tf-${ws.slice(0, 6)}`, name: "Fields" });
    await db.insert(memberships).values({ workspaceId: ws, userId: user, role: "owner" });

    await withWorkspace(db, ws, async (tx) => {
      const [p] = await tx
        .insert(projects)
        .values({ workspaceId: ws, key: "TF", name: "Task Fields", createdBy: user })
        .returning();
      if (!p) throw new Error("seed project failed");
      projectId = p.id;
      const [l] = await tx
        .insert(lists)
        .values({ workspaceId: ws, projectId, name: "todo", position: 0 })
        .returning();
      if (!l) throw new Error("seed list failed");
      listId = l.id;
      const task = await createTask(tx, {
        workspaceId: ws,
        projectId,
        listId,
        title: "field carrier",
        description: null,
        createdBy: user,
      });
      taskId = task.id;
    });
  });

  afterAll(async () => {
    if (!db) return;
    await db.delete(workspaces).where(eq(workspaces.id, ws));
    await db.delete(users).where(eq(users.id, user));
  });

  it("sets type, assignee, due date, and points in one patch", async () => {
    const due = new Date("2030-01-02T00:00:00.000Z");
    const row = await withWorkspace(db, ws, (tx) =>
      updateTask(tx, taskId, { type: "bug", assigneeId: user, dueAt: due, points: 5 }),
    );
    expect(row?.type).toBe("bug");
    expect(row?.assigneeId).toBe(user);
    expect(row?.dueAt?.toISOString()).toBe(due.toISOString());
    expect(row?.points).toBe(5);
  });

  it("clears assignee, due date, and points with nulls", async () => {
    const row = await withWorkspace(db, ws, (tx) =>
      updateTask(tx, taskId, { assigneeId: null, dueAt: null, points: null }),
    );
    expect(row?.assigneeId).toBeNull();
    expect(row?.dueAt).toBeNull();
    expect(row?.points).toBeNull();
    expect(row?.type).toBe("bug"); // untouched fields stay
  });
});
