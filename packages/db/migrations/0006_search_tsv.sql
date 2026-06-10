-- Task full-text search — Phase 1 PR 8.
--
-- GENERATED ALWAYS … STORED tsvector (trigger-free, cannot drift) over
-- key + title (weight A) and description (weight B), with a GIN index.
-- The column is intentionally NOT in the Drizzle schema — the search
-- adapter queries it with raw SQL, keeping the Task type clean.

ALTER TABLE "tasks" ADD COLUMN "search_tsv" tsvector GENERATED ALWAYS AS (
	setweight(to_tsvector('simple', coalesce("key", '') || ' ' || "title"), 'A') ||
	setweight(to_tsvector('english', coalesce("description", '')), 'B')
) STORED;--> statement-breakpoint
CREATE INDEX "tasks_search_idx" ON "tasks" USING gin ("search_tsv");
