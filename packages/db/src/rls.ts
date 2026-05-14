import { sql } from "drizzle-orm";
import type { Database } from "./client";

/**
 * Run `fn` with `app.workspace_id` set to `workspaceId` so RLS policies
 * scope every query inside the callback to that workspace.
 *
 * The setting is `local` (transaction-scoped) so it does NOT leak between
 * pooled connections.
 *
 * @example
 *   await withWorkspace(db, workspaceId, async (tx) => {
 *     return tx.select().from(tasks); // RLS filters to this workspace
 *   });
 */
export async function withWorkspace<T>(
  db: Database,
  workspaceId: string,
  fn: (tx: Database) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.workspace_id', ${workspaceId}, true)`);
    return fn(tx as unknown as Database);
  });
}

/**
 * Set the workspace context outside of a transaction. ONLY safe for
 * dedicated (non-pooled) connections — for pooled connections use
 * `withWorkspace` instead.
 */
export async function setWorkspace(db: Database, workspaceId: string): Promise<void> {
  await db.execute(sql`select set_config('app.workspace_id', ${workspaceId}, false)`);
}
