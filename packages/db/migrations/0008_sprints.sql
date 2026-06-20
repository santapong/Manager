-- Sprints + backlog (Phase 2 — Wave 1).
--
-- New table: sprints (time-boxed iterations per project). Adds tasks.sprint_id
-- (backlog = sprint_id IS NULL). Extends the activity CHECK with 'sprint_changed'
-- so task↔sprint moves can be recorded on the existing activity feed.

CREATE TABLE "sprints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"goal" text,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"status" text DEFAULT 'planned' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sprints_status_check" CHECK ("status" IN ('planned','active','completed'))
);
--> statement-breakpoint

ALTER TABLE "sprints"
	ADD CONSTRAINT "sprints_workspace_id_workspaces_id_fk"
	FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprints"
	ADD CONSTRAINT "sprints_project_id_projects_id_fk"
	FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprints"
	ADD CONSTRAINT "sprints_created_by_users_id_fk"
	FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- tasks.sprint_id (nullable; NULL = backlog)
ALTER TABLE "tasks" ADD COLUMN "sprint_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks"
	ADD CONSTRAINT "tasks_sprint_id_sprints_id_fk"
	FOREIGN KEY ("sprint_id") REFERENCES "public"."sprints"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "sprints_project_status_idx" ON "sprints" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "tasks_sprint_idx" ON "tasks" USING btree ("sprint_id");--> statement-breakpoint

-- Allow recording task↔sprint moves on the activity feed.
ALTER TABLE "activity" DROP CONSTRAINT IF EXISTS "activity_type_check";--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_type_check" CHECK ("type" IN ('task_created','status_changed','assignee_changed','priority_changed','type_changed','due_changed','points_changed','milestone_changed','comment_added','sprint_changed'));--> statement-breakpoint

-- RLS
ALTER TABLE "sprints" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sprints_isolation" ON "sprints" USING (workspace_id = current_workspace_id()) WITH CHECK (workspace_id = current_workspace_id());
