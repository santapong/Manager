import { dbNode } from "@manager/db";
import { createPostgresFtsSearchService, type SearchService } from "@manager/search";
import { env } from "../env";

/** App-side construction of the SearchService port (PLAN §7). */
export function searchService(): SearchService {
  return createPostgresFtsSearchService(dbNode(env.DATABASE_URL));
}
