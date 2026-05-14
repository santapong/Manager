import type { SearchHit, SearchService } from "./types";

/**
 * Stub for the Postgres FTS-backed search. Indexing happens by trigger
 * on the `tasks` table (added in the migration that lands with the
 * search Phase 1 PR). This adapter exposes the read path and a no-op
 * indexer; the real trigger-driven version lands when search ships.
 */
export function createPostgresFtsSearchService(): SearchService {
  return {
    async indexTask() {
      // Postgres trigger handles indexing — adapter is no-op for now.
    },
    async removeTask() {
      // Same — cascade delete from trigger.
    },
    async search(_workspaceId: string, _query: string): Promise<SearchHit[]> {
      return [];
    },
  };
}
