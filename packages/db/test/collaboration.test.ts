import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createNodeClient } from "../src/client";
import { recordActivity, listActivityForTask } from "../src/queries/activity";
import { createComment, listCommentsForTask, parseMentionTokens } from "../src/queries/comments";
import {
  countUnread,
  listNotificationsForUser,
  markAllRead,
  markRead,
} from "../src/queries/notifications";
import { createTask, listTasks, moveTask } from "../src/queries/tasks";
import { withWorkspace } from "../src/rls";
import { comments, lists, memberships, projects, tasks, users, workspaces } from "../src/schema";

const url = process.env.DATABASE_URL;
const describeIfDb = url ? describe : describe.skip;

const mention = (name: string, id: string) => `@[${name}](${id})`;

describeIfDb("collaboration — comments, mentions, notifications, activity, board moves", () => {
  const db = url ? createNodeClient(url) : (null as never);

  const wsA = randomUUID();
  const wsB = randomUUID();
  const author = randomUUID();
  const member = randomUUID();
  const outsider = randomUUID();

  let projectId = "";
  let listId = "";
  let task: { id: string; key: string; title: string; projectId: string } = {
    id: "",
    key: "",
    title: "",
    projectId: "",
  };
  // True when the connection role is subject to RLS; isolation assertions
  // skip otherwise (table-owner connections bypass policies — see PLAN §6).
  let rlsEnforced = false;

  beforeAll(async () => {
    await db.insert(users).values([
      { id: author, email: `author-${author.slice(0, 8)}@test.local`, name: "Author" },
      { id: member, email: `member-${member.slice(0, 8)}@test.local`, name: "Member" },
      { id: outsider, email: `outsider-${outsider.slice(0, 8)}@test.local`, name: "Outsider" },
    ]);
    await db.insert(workspaces).values([
      { id: wsA, slug: `col-a-${wsA.slice(0, 6)}`, name: "Collab A" },
      { id: wsB, slug: `col-b-${wsB.slice(0, 6)}`, name: "Collab B" },
    ]);
    await db.insert(memberships).values([
      { workspaceId: wsA, userId: author, role: "owner" },
      { workspaceId: wsA, userId: member, role: "member" },
      { workspaceId: wsB, userId: outsider, role: "owner" },
    ]);

    await withWorkspace(db, wsA, async (tx) => {
      const [p] = await tx
        .insert(projects)
        .values({ workspaceId: wsA, key: "COL", name: "Collab", createdBy: author })
        .returning();
      if (!p) throw new Error("seed project failed");
      projectId = p.id;
      const [l] = await tx
        .insert(lists)
        .values({ workspaceId: wsA, projectId, name: "todo", position: 0 })
        .returning();
      if (!l) throw new Error("seed list failed");
      listId = l.id;
      const t = await createTask(tx, {
        workspaceId: wsA,
        projectId,
        listId,
        title: "Comment target",
        description: null,
        createdBy: author,
      });
      task = { id: t.id, key: t.key, title: t.title, projectId };
    });

    // Probe whether RLS binds this connection: a cross-workspace insert
    // succeeds on bypassing (owner) roles and is denied on bound roles.
    try {
      const [probe] = await withWorkspace(db, wsB, (tx) =>
        tx
          .insert(comments)
          .values({ workspaceId: wsA, taskId: task.id, authorId: author, body: "probe" })
          .returning(),
      );
      rlsEnforced = false;
      if (probe) await db.delete(comments).where(eq(comments.id, probe.id));
    } catch {
      rlsEnforced = true;
    }
  });

  afterAll(async () => {
    if (!db) return;
    await db.delete(workspaces).where(eq(workspaces.id, wsA));
    await db.delete(workspaces).where(eq(workspaces.id, wsB));
    for (const id of [author, member, outsider]) {
      await db.delete(users).where(eq(users.id, id));
    }
  });

  it("parseMentionTokens extracts unique uuids from canonical tokens", () => {
    const a = randomUUID();
    const b = randomUUID();
    const body = `hey ${mention("A B", a)} and ${mention("C", b)} and again ${mention("A B", a)} but not @plain or (${a})`;
    expect(parseMentionTokens(body).sort()).toEqual([a, b].sort());
    expect(parseMentionTokens("no mentions here")).toEqual([]);
  });

  it("createComment stores member mentions only and notifies them, never the author", async () => {
    const body = `ping ${mention("Member", member)} ${mention("Outsider", outsider)} ${mention("Author", author)}`;
    const { comment, mentionedUserIds } = await withWorkspace(db, wsA, (tx) =>
      createComment(tx, { workspaceId: wsA, task, authorId: author, body }),
    );

    // outsider is not a member → dropped; author kept in mentions but not notified.
    expect(comment.mentions.sort()).toEqual([author, member].sort());
    expect(mentionedUserIds).toEqual([member]);

    const memberUnread = await withWorkspace(db, wsA, (tx) =>
      countUnread(tx, { workspaceId: wsA, userId: member }),
    );
    expect(memberUnread).toBe(1);
    const authorUnread = await withWorkspace(db, wsA, (tx) =>
      countUnread(tx, { workspaceId: wsA, userId: author }),
    );
    expect(authorUnread).toBe(0);

    const inbox = await withWorkspace(db, wsA, (tx) =>
      listNotificationsForUser(tx, { workspaceId: wsA, userId: member }),
    );
    expect(inbox[0]?.type).toBe("mention");
    expect(inbox[0]?.task?.key).toBe(task.key);
    expect(inbox[0]?.payload.excerpt).toContain("ping");

    const feed = await withWorkspace(db, wsA, (tx) =>
      listActivityForTask(tx, wsA, task.id),
    );
    expect(feed.some((e) => e.type === "comment_added")).toBe(true);

    const thread = await withWorkspace(db, wsA, (tx) =>
      listCommentsForTask(tx, wsA, task.id),
    );
    expect(thread).toHaveLength(1);
    expect(thread[0]?.author?.id).toBe(author);
  });

  it("markRead is scoped to the recipient", async () => {
    const inbox = await withWorkspace(db, wsA, (tx) =>
      listNotificationsForUser(tx, { workspaceId: wsA, userId: member, unreadOnly: true }),
    );
    const target = inbox[0];
    expect(target).toBeDefined();

    // The author cannot mark the member's notification read.
    await withWorkspace(db, wsA, (tx) =>
      markRead(tx, { workspaceId: wsA, userId: author, id: target!.id }),
    );
    expect(
      await withWorkspace(db, wsA, (tx) => countUnread(tx, { workspaceId: wsA, userId: member })),
    ).toBe(1);

    await withWorkspace(db, wsA, (tx) =>
      markRead(tx, { workspaceId: wsA, userId: member, id: target!.id }),
    );
    expect(
      await withWorkspace(db, wsA, (tx) => countUnread(tx, { workspaceId: wsA, userId: member })),
    ).toBe(0);
  });

  it("markAllRead clears every unread row for the user", async () => {
    await withWorkspace(db, wsA, (tx) =>
      createComment(tx, {
        workspaceId: wsA,
        task,
        authorId: author,
        body: `again ${mention("Member", member)} and ${mention("Member", member)}`,
      }),
    );
    expect(
      await withWorkspace(db, wsA, (tx) => countUnread(tx, { workspaceId: wsA, userId: member })),
    ).toBe(1);
    await withWorkspace(db, wsA, (tx) => markAllRead(tx, { workspaceId: wsA, userId: member }));
    expect(
      await withWorkspace(db, wsA, (tx) => countUnread(tx, { workspaceId: wsA, userId: member })),
    ).toBe(0);
  });

  it("recordActivity appends and lists newest-first with actor", async () => {
    await withWorkspace(db, wsA, (tx) =>
      recordActivity(tx, {
        workspaceId: wsA,
        projectId,
        taskId: task.id,
        actorId: member,
        type: "status_changed",
        payload: { from: "open", to: "in_progress" },
      }),
    );
    const feed = await withWorkspace(db, wsA, (tx) => listActivityForTask(tx, wsA, task.id));
    expect(feed[0]?.type).toBe("status_changed");
    expect(feed[0]?.actor?.id).toBe(member);
    expect(feed[0]?.payload).toEqual({ from: "open", to: "in_progress" });
  });

  describe("board moves (fractional positions)", () => {
    let t1 = "";
    let t2 = "";
    let t3 = "";

    beforeAll(async () => {
      await withWorkspace(db, wsA, async (tx) => {
        const mk = (title: string) =>
          createTask(tx, {
            workspaceId: wsA,
            projectId,
            listId,
            title,
            description: null,
            createdBy: author,
          });
        t1 = (await mk("Board 1")).id;
        t2 = (await mk("Board 2")).id;
        t3 = (await mk("Board 3")).id;
      });
    });

    const openOrder = async () =>
      (await withWorkspace(db, wsA, (tx) => listTasks(tx, projectId, { status: "open" })))
        .filter((t) => [t1, t2, t3].includes(t.id))
        .map((t) => t.id);

    it("moves between two neighbors via midpoint", async () => {
      // order is t1, t2, t3 — move t3 between t1 and t2.
      await withWorkspace(db, wsA, (tx) =>
        moveTask(tx, { id: t3, workspaceId: wsA, status: "open", beforeId: t1, afterId: t2 }),
      );
      expect(await openOrder()).toEqual([t1, t3, t2]);
    });

    it("moves to an empty column and back with append/prepend", async () => {
      const moved = await withWorkspace(db, wsA, (tx) =>
        moveTask(tx, { id: t1, workspaceId: wsA, status: "in_progress" }),
      );
      expect(moved.status).toBe("in_progress");
      expect(moved.position).toBe(1024);

      // prepend back on top of the open column (before the current head t3).
      await withWorkspace(db, wsA, (tx) =>
        moveTask(tx, { id: t1, workspaceId: wsA, status: "open", afterId: t3 }),
      );
      expect(await openOrder()).toEqual([t1, t3, t2]);
    });

    it("rebalances the column when the midpoint gap is exhausted", async () => {
      // Force an unusable gap between t1 and t3.
      await withWorkspace(db, wsA, async (tx) => {
        await tx.update(tasks).set({ position: 1 }).where(eq(tasks.id, t1));
        await tx.update(tasks).set({ position: 1 + 1e-9 }).where(eq(tasks.id, t3));
      });
      await withWorkspace(db, wsA, (tx) =>
        moveTask(tx, { id: t2, workspaceId: wsA, status: "open", beforeId: t1, afterId: t3 }),
      );
      expect(await openOrder()).toEqual([t1, t2, t3]);

      const rows = await withWorkspace(db, wsA, (tx) =>
        listTasks(tx, projectId, { status: "open" }),
      );
      const positions = rows.filter((t) => [t1, t2, t3].includes(t.id)).map((t) => t.position);
      for (let i = 1; i < positions.length; i++) {
        expect(positions[i]! - positions[i - 1]!).toBeGreaterThan(1e-6);
      }
    });
  });

  describe("RLS isolation (skips on bypassing/owner connections)", () => {
    it("workspace B cannot read workspace A comments", async (ctx) => {
      if (!rlsEnforced) ctx.skip();
      const rows = await withWorkspace(db, wsB, (tx) =>
        tx.select().from(comments).where(eq(comments.workspaceId, wsA)),
      );
      expect(rows).toHaveLength(0);
    });

    it("cross-workspace comment insert is blocked by WITH CHECK", async (ctx) => {
      if (!rlsEnforced) ctx.skip();
      await expect(
        withWorkspace(db, wsB, (tx) =>
          tx
            .insert(comments)
            .values({ workspaceId: wsA, taskId: task.id, authorId: author, body: "smuggled" }),
        ),
      ).rejects.toThrow();
    });
  });

  it("lists filter and sort by the new options", async () => {
    await withWorkspace(db, wsA, async (tx) => {
      await tx
        .update(tasks)
        .set({ priority: "urgent", assigneeId: member })
        .where(and(eq(tasks.id, task.id), eq(tasks.workspaceId, wsA)));
    });
    const urgent = await withWorkspace(db, wsA, (tx) =>
      listTasks(tx, projectId, { priority: "urgent" }),
    );
    expect(urgent.map((t) => t.id)).toEqual([task.id]);

    const mine = await withWorkspace(db, wsA, (tx) =>
      listTasks(tx, projectId, { assignee: member }),
    );
    expect(mine.map((t) => t.id)).toEqual([task.id]);

    const byPriority = await withWorkspace(db, wsA, (tx) =>
      listTasks(tx, projectId, { sort: "priority", dir: "desc" }),
    );
    expect(byPriority[0]?.id).toBe(task.id); // urgent first
  });
});
