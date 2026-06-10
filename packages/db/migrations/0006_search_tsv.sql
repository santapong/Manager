-- Task full-text search — Phase 1 PR 8.
--
-- GENERATED ALWAYS … STORED tsvector (trigger-free, cannot drift), GIN
-- indexed. Keys use the 'simple' config (no stemming — "FND-1" stays
-- intact); title + description use 'english' so queries stem the same
-- way they're indexed ("billing" matches "billing engine").
-- The column is intentionally NOT in the Drizzle schema — the search
-- adapter queries it with raw SQL, keeping the Task type clean.

ALTER TABLE "tasks" ADD COLUMN "search_tsv" tsvector GENERATED ALWAYS AS (
	setweight(to_tsvector('simple', coalesce("key", '')), 'A') ||
	setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
	setweight(to_tsvector('english', coalesce("description", '')), 'B')
) STORED;--> statement-breakpoint
CREATE INDEX "tasks_search_idx" ON "tasks" USING gin ("search_tsv");
