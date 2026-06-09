"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { tasks as tasksTable } from "@manager/db";
import { listMembers, updateTask as dbUpdateTask } from "@manager/db/queries";
import { withActiveWorkspace } from "@/src/lib/workspace-context";
import * as labelService from "@/src/server/labels";
import * as milestoneService from "@/src/server/milestones";
import * as subtaskService from "@/src/server/subtasks";
import * as linkService from "@/src/server/links";
import { UpdateTaskSchema } from "@/src/lib/validators/task";

const TaskIdInput = z.object({ id: z.string().uuid() });

/**
 * Bundle of everything the task drawer needs in one round trip:
 *   - the task row
 *   - subtasks
 *   - labels attached
 *   - milestones available for this project (for the picker)
 *   - task_links involving this task (with the other side's title + key)
 *   - workspace members (for the assignee picker)
 */
export async function getTaskDetailAction(input: { id: string }) {
  const parsed = TaskIdInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  return withActiveWorkspace(async (tx, ws) => {
    const [task] = await tx
      .select()
      .from(tasksTable)
      .where(and(eq(tasksTable.workspaceId, ws.id), eq(tasksTable.id, parsed.data.id)))
      .limit(1);
    if (!task) return { error: "task_not_found" as const };

    const [subtasks, tags, projectMilestones, taskLinks, members] = await Promise.all([
      subtaskService.listForTask(tx, ws.id, task.id),
      labelService.listForTask(tx, task.id),
      milestoneService.list(tx, ws.id, task.projectId),
      linkService.listTaskLinks(tx, ws.id, task.id),
      listMembers(tx, ws.id),
    ]);

    // Resolve link counterpart task summaries.
    const otherIds = Array.from(
      new Set(
        taskLinks.flatMap((l) => [l.fromTaskId, l.toTaskId]).filter((id) => id !== task.id),
      ),
    );
    const others =
      otherIds.length === 0
        ? []
        : await tx
            .select({ id: tasksTable.id, key: tasksTable.key, title: tasksTable.title })
            .from(tasksTable)
            .where(and(eq(tasksTable.workspaceId, ws.id), inArray(tasksTable.id, otherIds)));

    const otherById = new Map(others.map((o) => [o.id, o] as const));

    return {
      ok: true as const,
      task: {
        id: task.id,
        key: task.key,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        type: task.type,
        assigneeId: task.assigneeId,
        dueAt: task.dueAt ? task.dueAt.toISOString().slice(0, 10) : null,
        points: task.points,
        milestoneId: task.milestoneId,
        projectId: task.projectId,
      },
      subtasks: subtasks.map((s) => ({ id: s.id, title: s.title, done: s.done })),
      tags: tags.map((l) => ({ id: l.id, name: l.name, color: l.color })),
      milestones: projectMilestones.map((m) => ({ id: m.id, name: m.name })),
      members: members.map((m) => ({ userId: m.userId, name: m.name, email: m.email })),
      links: taskLinks.map((l) => {
        const other = l.fromTaskId === task.id ? l.toTaskId : l.fromTaskId;
        const direction: "outgoing" | "incoming" =
          l.fromTaskId === task.id ? "outgoing" : "incoming";
        const summary = otherById.get(other);
        return {
          id: l.id,
          type: l.type,
          direction,
          other: summary
            ? { id: summary.id, key: summary.key, title: summary.title }
            : { id: other, key: "?", title: "(hidden)" },
        };
      }),
    };
  });
}

/**
 * Patch task fields (title / description / status / priority / type /
 * assignee / due date / points / milestone). Used by the drawer's inline
 * editors. Reuses UpdateTaskSchema; `dueAt` arrives as "YYYY-MM-DD" | "" |
 * null and is transformed to a Date by the schema.
 */
export async function patchTaskAction(
  slug: string,
  projectKey: string,
  input: z.input<typeof UpdateTaskSchema>,
) {
  const parsed = UpdateTaskSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const { id, ...patch } = parsed.data;
  await withActiveWorkspace(async (tx) => dbUpdateTask(tx, id, patch));
  revalidatePath(`/${slug}/projects/${projectKey}`);
  return { ok: true as const };
}
