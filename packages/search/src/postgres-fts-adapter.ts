import { sql } from "drizzle-orm";
import { withWorkspace, type Database } from "@manager/db";
import type { SearchHit, SearchService } from "./types";

interface FtsRow {
  id: string;
  key: string;
  title: string;
  status: "open" | "in_progress" | "done";
  project_key: string;
  rank: number;
}

/**
 * Postgres FTS over the GENERATED `tasks.search_tsv` column (migration
 * 0006): key + title weighted A, description weighted B, GIN-indexed.
 * Indexing is a no-op — the generated column cannot drift. A key-prefix
 * ILIKE arm makes exact-key jumps ("ENG-12") work even when the tsquery
 * parser would not match.
 */
export function createPostgresFtsSearchService(db: Database): SearchService {
  return {
    async indexTask() {
      // Generated column — nothing to index.
    },
    async removeTask() {
      // Row deletion removes the vector with it.
    },
    async search(workspaceId, query, options = {}): Promise<SearchHit[]> {
      const q = query.trim();
      if (!q) return [];
      const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
      const offset = Math.max(options.offset ?? 0, 0);

      return withWorkspace(db, workspaceId, async (tx) => {
        // Explicit workspace_id filter alongside RLS — owner connections
        // bypass policies (PLAN §6).
        const rows = (await tx.execute(sql`
          select
            t.id,
            t.key,
            t.title,
            t.status,
            p.key as project_key,
            ts_rank(t.search_tsv, websearch_to_tsquery('english', ${q}))::float8 as rank
          from tasks t
          join projects p on p.id = t.project_id
          where t.workspace_id = ${workspaceId}
            and (
              t.search_tsv @@ websearch_to_tsquery('english', ${q})
              or t.key ilike ${q + "%"}
            )
          order by rank desc, t.updated_at desc
          limit ${limit} offset ${offset}
        `)) as unknown as FtsRow[];

        return rows.map((r) => ({
          id: r.id,
          key: r.key,
          title: r.title,
          status: r.status,
          projectKey: r.project_key,
          rank: Number(r.rank),
        }));
      });
    },
  };
}
