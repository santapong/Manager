import { and, eq, inArray, sql } from "drizzle-orm";
import {
  githubConnections,
  githubLinks,
  tasks,
  withWorkspace,
  type Database,
  type GithubConnection,
} from "@manager/db";
import {
  extractKeysFromPR,
  generateWebhookSecret,
  mapPrToStatus,
  type ParsedPR,
} from "@manager/integrations";

/**
 * GitHub connection CRUD + the inbound-webhook apply logic. The CRUD helpers
 * run inside the caller's `withActiveWorkspace` (RLS scoped). The webhook path
 * (`findConnectionsByRepo` + `applyPullRequestToWorkspace`) runs outside a
 * request's workspace context, so it manages RLS itself.
 */

export function listConnections(
  db: Database,
  workspaceId: string,
): Promise<GithubConnection[]> {
  return db
    .select()
    .from(githubConnections)
    .where(eq(githubConnections.workspaceId, workspaceId))
    .orderBy(githubConnections.owner, githubConnections.repo);
}

export interface CreateConnectionInput {
  workspaceId: string;
  owner: string;
  repo: string;
  userId: string;
}

/**
 * Create a connection with a freshly generated webhook secret. A unique
 * violation (workspace already connected to this owner/repo) propagates as a
 * Postgres error; the calling Server Action maps it to a friendly message.
 */
export async function createConnection(
  db: Database,
  input: CreateConnectionInput,
): Promise<GithubConnection> {
  const [row] = await db
    .insert(githubConnections)
    .values({
      workspaceId: input.workspaceId,
      owner: input.owner,
      repo: input.repo,
      webhookSecret: generateWebhookSecret(),
      connectedBy: input.userId,
    })
    .returning();
  if (!row) throw new Error("github_connection_insert_failed");
  return row;
}

export async function deleteConnection(
  db: Database,
  workspaceId: string,
  id: string,
): Promise<void> {
  await db
    .delete(githubConnections)
    .where(and(eq(githubConnections.workspaceId, workspaceId), eq(githubConnections.id, id)));
}

/** Rotate the webhook secret for a connection. Returns the updated row. */
export async function regenerateSecret(
  db: Database,
  workspaceId: string,
  id: string,
): Promise<GithubConnection | undefined> {
  const [row] = await db
    .update(githubConnections)
    .set({ webhookSecret: generateWebhookSecret(), updatedAt: new Date() })
    .where(and(eq(githubConnections.workspaceId, workspaceId), eq(githubConnections.id, id)))
    .returning();
  return row;
}

/**
 * Global, case-insensitive lookup of every connection for a repo across ALL
 * workspaces — used by the webhook, which has no request workspace context.
 *
 * The runtime DB connection is the table owner and bypasses RLS, so this query
 * (issued without `app.workspace_id` set) returns all matching rows. Same
 * precedent as invite/session lookups. The webhook then HMAC-verifies each
 * connection's secret before acting, so an attacker can't fan a forged payload
 * into a workspace they don't control.
 */
export function findConnectionsByRepo(
  db: Database,
  owner: string,
  repo: string,
): Promise<GithubConnection[]> {
  return db
    .select()
    .from(githubConnections)
    .where(
      and(
        sql`lower(${githubConnections.owner}) = lower(${owner})`,
        sql`lower(${githubConnections.repo}) = lower(${repo})`,
      ),
    );
}

export interface ApplyPrResult {
  linked: number;
  statusUpdated: number;
}

/**
 * Apply a parsed PR event to one workspace: link the PR to every task whose key
 * it references, and (when the action implies one) drive those tasks' status.
 *
 * Runs inside `withWorkspace` so every statement is RLS-scoped to this
 * workspace — even though the webhook resolved the workspace out-of-band, we
 * re-establish the tenant boundary before touching task data.
 *
 * Deliberately does NOT write to the `activity` table: its CHECK constraint
 * doesn't permit github event types. Links + status only.
 */
export function applyPullRequestToWorkspace(
  db: Database,
  workspaceId: string,
  pr: ParsedPR,
): Promise<ApplyPrResult> {
  return withWorkspace(db, workspaceId, async (tx) => {
    const keys = extractKeysFromPR({ title: pr.title, branch: pr.branch, body: pr.body });
    if (keys.length === 0) return { linked: 0, statusUpdated: 0 };

    // Task keys are workspace-unique (project prefix), so an inArray match
    // within the RLS-scoped workspace is exact.
    const matched = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(inArray(tasks.key, keys));
    if (matched.length === 0) return { linked: 0, statusUpdated: 0 };

    const nextStatus = mapPrToStatus(pr);
    let linked = 0;
    let statusUpdated = 0;

    for (const task of matched) {
      // Upsert the link on the (taskId, kind, url) unique constraint. Re-deliveries
      // / state changes update the existing row rather than inserting duplicates.
      await tx
        .insert(githubLinks)
        .values({
          workspaceId,
          taskId: task.id,
          kind: "pull_request",
          number: pr.number,
          url: pr.htmlUrl,
          title: pr.title,
          state: pr.state,
          merged: pr.merged,
          author: pr.author,
        })
        .onConflictDoUpdate({
          target: [githubLinks.taskId, githubLinks.kind, githubLinks.url],
          set: {
            number: pr.number,
            title: pr.title,
            state: pr.state,
            merged: pr.merged,
            author: pr.author,
            updatedAt: new Date(),
          },
        });
      linked += 1;

      if (nextStatus) {
        await tx
          .update(tasks)
          .set({ status: nextStatus, updatedAt: new Date() })
          .where(eq(tasks.id, task.id));
        statusUpdated += 1;
      }
    }

    return { linked, statusUpdated };
  });
}
