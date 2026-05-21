import { sql } from "drizzle-orm";
import type { Database } from "../client";

/**
 * Kind of link graph to traverse for cycle detection.
 *
 * - `task_blocks`     — edges in `task_links` of type 'blocks'
 * - `project_depends` — edges in `project_links` of type 'depends_on'
 *
 * Only directional/dependency-bearing types check for cycles.
 * 'relates' / 'duplicates' are symmetric/advisory and skipped.
 */
export type CycleKind = "task_blocks" | "project_depends";

/**
 * Would adding an edge `from -> to` create a cycle in the directional
 * dependency graph defined by `kind`?
 *
 * Implementation: a recursive CTE walks the existing graph forward from
 * `to` and returns `true` if it ever reaches `from`. A self-loop
 * (`from === to`) is treated as a cycle without hitting the DB.
 *
 * Runs under the current `app.workspace_id` GUC, so RLS confines the
 * walk to the caller's workspace — cross-tenant edges are invisible.
 *
 * @example
 *   await withWorkspace(db, wsId, async (tx) => {
 *     if (await wouldCreateCycle(tx, fromId, toId, "task_blocks")) {
 *       throw new Error("This dependency would create a cycle");
 *     }
 *     await tx.insert(taskLinks).values({ ... });
 *   });
 */
export async function wouldCreateCycle(
  db: Database,
  fromId: string,
  toId: string,
  kind: CycleKind,
): Promise<boolean> {
  if (fromId === toId) return true;

  const query =
    kind === "task_blocks"
      ? sql`
          with recursive reach(node) as (
            select to_task_id from task_links
              where from_task_id = ${toId} and type = 'blocks'
            union
            select tl.to_task_id from task_links tl
              join reach r on r.node = tl.from_task_id
              where tl.type = 'blocks'
          )
          select 1 as hit from reach where node = ${fromId} limit 1
        `
      : sql`
          with recursive reach(node) as (
            select to_project_id from project_links
              where from_project_id = ${toId} and type = 'depends_on'
            union
            select pl.to_project_id from project_links pl
              join reach r on r.node = pl.from_project_id
              where pl.type = 'depends_on'
          )
          select 1 as hit from reach where node = ${fromId} limit 1
        `;

  const result = await db.execute(query);
  // `postgres-js` returns an array-like result; `neon-http` returns
  // `{ rows: [...] }`. Normalise.
  const rows = (Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows) ?? [];
  return rows.length > 0;
}
