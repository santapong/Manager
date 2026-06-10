-- Kanban fractional ordering — Phase 1 PR 4.
--
-- tasks.position becomes double precision so cards can be inserted
-- between neighbors via midpoints ((prev+next)/2) without renumbering.
-- Existing integer values cast exactly; the (list_id, position) index
-- survives the type change.

ALTER TABLE "tasks" ALTER COLUMN "position" TYPE double precision USING "position"::double precision;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "position" SET DEFAULT 0;
