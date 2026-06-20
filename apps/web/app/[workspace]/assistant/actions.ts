"use server";

// Apply a gated assistant write proposal (Wave 2c). This is the ONLY path in
// the assistant feature that mutates data. The streaming route records
// *proposals* (no DB write); the user clicks Confirm, the client hands us the
// proposal JSON, and we:
//
//   1. parse it with `ProposalSchema` (a discriminated union),
//   2. RE-RESOLVE the project/task by its human key + the active workspace —
//      the embedded uuids are never trusted — inside `withActiveWorkspace` so
//      the mutation is RLS-scoped to the caller,
//   3. run the existing query (`createTask` / `updateTask` / `moveTask`) and
//      record the matching activity, exactly like the normal task forms do,
//   4. `revalidatePath` the affected project + board.
//
// Errors are returned as `{ error }` (a short, actionable message), never
// thrown to the client as a stack. Nothing here re-calls the model: applying a
// proposal is independent of the chat loop.

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import {
  createTask as dbCreateTask,
  moveTask as dbMoveTask,
  updateTask as dbUpdateTask,
  getProjectByKey,
  recordActivity,
} from "@manager/db/queries";
import { lists, tasks as tasksTable } from "@manager/db";
import { auth } from "@/src/lib/auth";
import { withActiveWorkspace } from "@/src/lib/workspace-context";
import { ProposalSchema } from "@/src/lib/validators/ai";

type ApplyResult = { ok: true; taskKey: string } | { error: string };

/**
 * Apply a single confirmed proposal. `slug` scopes `revalidatePath` only; the
 * workspace used for the write comes from the active-workspace cookie (so a
 * forged slug cannot cross tenants). `proposalJson` is the stringified proposal
 * the client received on the stream.
 */
export async function applyProposalAction(slug: string, proposalJson: string): Promise<ApplyResult> {
  let raw: unknown;
  try {
    raw = JSON.parse(proposalJson);
  } catch {
    return { error: "That proposal is no longer valid." };
  }
  const parsed = ProposalSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: "That proposal is no longer valid." };
  }
  const proposal = parsed.data;

  const svc = await auth();
  const session = await svc.requireSession();

  try {
    const result = await withActiveWorkspace(async (tx, ws): Promise<ApplyResult> => {
      switch (proposal.kind) {
        case "create_task": {
          // Re-resolve project + its default list by key; ignore embedded ids.
          const project = await getProjectByKey(tx, ws.id, proposal.projectKey);
          if (!project) return { error: `Project "${proposal.projectKey}" no longer exists.` };
          const [list] = await tx
            .select({ id: lists.id })
            .from(lists)
            .where(and(eq(lists.workspaceId, ws.id), eq(lists.projectId, project.id)))
            .limit(1);
          if (!list) return { error: `Project "${project.key}" has no list to add tasks to.` };

          const task = await dbCreateTask(tx, {
            workspaceId: ws.id,
            projectId: project.id,
            listId: list.id,
            title: proposal.title,
            description: proposal.description ?? null,
            ...(proposal.priority ? { priority: proposal.priority } : {}),
            ...(proposal.type ? { type: proposal.type } : {}),
            createdBy: session.user.id,
          });
          await recordActivity(tx, {
            workspaceId: ws.id,
            projectId: project.id,
            taskId: task.id,
            actorId: session.user.id,
            type: "task_created",
            payload: { key: task.key },
          });
          return { ok: true, taskKey: task.key };
        }

        case "update_task": {
          // Re-resolve the task by key + workspace; ignore embedded ids.
          const task = await resolveTask(tx, ws.id, proposal.taskKey);
          if (!task) return { error: `Task "${proposal.taskKey}" no longer exists.` };

          const patch: Parameters<typeof dbUpdateTask>[2] = {};
          if (proposal.title !== undefined) patch.title = proposal.title;
          if (proposal.description !== undefined) patch.description = proposal.description ?? null;
          if (proposal.status !== undefined) patch.status = proposal.status;
          if (proposal.priority !== undefined) patch.priority = proposal.priority;
          if (proposal.points !== undefined) patch.points = proposal.points;

          await dbUpdateTask(tx, task.id, patch);

          if (proposal.status !== undefined && proposal.status !== task.status) {
            await recordActivity(tx, {
              workspaceId: ws.id,
              projectId: task.projectId,
              taskId: task.id,
              actorId: session.user.id,
              type: "status_changed",
              payload: { from: task.status, to: proposal.status },
            });
          }
          return { ok: true, taskKey: task.key };
        }

        case "move_task": {
          const task = await resolveTask(tx, ws.id, proposal.taskKey);
          if (!task) return { error: `Task "${proposal.taskKey}" no longer exists.` };

          const moved = await dbMoveTask(tx, {
            id: task.id,
            workspaceId: ws.id,
            status: proposal.status,
          });
          if (task.status !== moved.status) {
            await recordActivity(tx, {
              workspaceId: ws.id,
              projectId: moved.projectId,
              taskId: moved.id,
              actorId: session.user.id,
              type: "status_changed",
              payload: { from: task.status, to: moved.status },
            });
          }
          return { ok: true, taskKey: task.key };
        }

        default: {
          // Exhaustiveness guard — the union is closed.
          const _never: never = proposal;
          return _never;
        }
      }
    });

    if ("ok" in result) revalidateForTask(slug, result.taskKey);
    return result;
  } catch {
    return { error: "Couldn't apply that change. Please try again." };
  }
}

/** Resolve a task by workspace + human key, returning columns the apply needs. */
async function resolveTask(
  tx: Parameters<Parameters<typeof withActiveWorkspace>[0]>[0],
  workspaceId: string,
  key: string,
) {
  const [row] = await tx
    .select({
      id: tasksTable.id,
      key: tasksTable.key,
      projectId: tasksTable.projectId,
      status: tasksTable.status,
    })
    .from(tasksTable)
    .where(and(eq(tasksTable.workspaceId, workspaceId), eq(tasksTable.key, key)))
    .limit(1);
  return row;
}

/**
 * Revalidate the project list/board the task belongs to. Task keys are
 * `PROJECTKEY-seq` (e.g. "ENG-12"), so the project key is everything before the
 * last hyphen — enough to invalidate the right routes after a write.
 */
function revalidateForTask(slug: string, taskKey: string): void {
  const projectKey = taskKey.slice(0, taskKey.lastIndexOf("-"));
  if (!projectKey) return;
  revalidatePath(`/${slug}/projects/${projectKey}`);
  revalidatePath(`/${slug}/projects/${projectKey}/board`);
}
