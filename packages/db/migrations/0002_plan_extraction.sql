-- Multi-format plan extraction — Milestone A schema additions.
--
-- New tables: milestones, labels, task_labels, project_labels, task_links,
-- project_links, subtasks. Plus columns on projects (start_date, target_date)
-- and tasks (milestone_id). All tenant-scoped tables get RLS + WITH CHECK.

CREATE TABLE "milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"target_date" date,
	"status" text DEFAULT 'open' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#888888' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_labels" (
	"task_id" uuid NOT NULL,
	"label_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_labels_task_id_label_id_pk" PRIMARY KEY("task_id","label_id")
);
--> statement-breakpoint
CREATE TABLE "project_labels" (
	"project_id" uuid NOT NULL,
	"label_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_labels_project_id_label_id_pk" PRIMARY KEY("project_id","label_id")
);
--> statement-breakpoint
CREATE TABLE "task_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"from_task_id" uuid NOT NULL,
	"to_task_id" uuid NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_links_from_to_type_unique" UNIQUE("from_task_id","to_task_id","type"),
	CONSTRAINT "task_links_no_self_check" CHECK ("from_task_id" <> "to_task_id"),
	CONSTRAINT "task_links_type_check" CHECK ("type" IN ('blocks','relates','duplicates'))
);
--> statement-breakpoint
CREATE TABLE "project_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"from_project_id" uuid NOT NULL,
	"to_project_id" uuid NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_links_from_to_type_unique" UNIQUE("from_project_id","to_project_id","type"),
	CONSTRAINT "project_links_no_self_check" CHECK ("from_project_id" <> "to_project_id"),
	CONSTRAINT "project_links_type_check" CHECK ("type" IN ('depends_on','relates'))
);
--> statement-breakpoint
CREATE TABLE "subtasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"title" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"assignee_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "milestones"
	ADD CONSTRAINT "milestones_workspace_id_workspaces_id_fk"
	FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones"
	ADD CONSTRAINT "milestones_project_id_projects_id_fk"
	FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones"
	ADD CONSTRAINT "milestones_status_check" CHECK ("status" IN ('open','closed'));--> statement-breakpoint
ALTER TABLE "labels"
	ADD CONSTRAINT "labels_workspace_id_workspaces_id_fk"
	FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_labels"
	ADD CONSTRAINT "task_labels_task_id_tasks_id_fk"
	FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_labels"
	ADD CONSTRAINT "task_labels_label_id_labels_id_fk"
	FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_labels"
	ADD CONSTRAINT "project_labels_project_id_projects_id_fk"
	FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_labels"
	ADD CONSTRAINT "project_labels_label_id_labels_id_fk"
	FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_links"
	ADD CONSTRAINT "task_links_workspace_id_workspaces_id_fk"
	FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_links"
	ADD CONSTRAINT "task_links_from_task_id_tasks_id_fk"
	FOREIGN KEY ("from_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_links"
	ADD CONSTRAINT "task_links_to_task_id_tasks_id_fk"
	FOREIGN KEY ("to_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_links"
	ADD CONSTRAINT "project_links_workspace_id_workspaces_id_fk"
	FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_links"
	ADD CONSTRAINT "project_links_from_project_id_projects_id_fk"
	FOREIGN KEY ("from_project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_links"
	ADD CONSTRAINT "project_links_to_project_id_projects_id_fk"
	FOREIGN KEY ("to_project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtasks"
	ADD CONSTRAINT "subtasks_workspace_id_workspaces_id_fk"
	FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtasks"
	ADD CONSTRAINT "subtasks_task_id_tasks_id_fk"
	FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtasks"
	ADD CONSTRAINT "subtasks_assignee_id_users_id_fk"
	FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- Columns on existing tables
ALTER TABLE "projects" ADD COLUMN "start_date" date;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "target_date" date;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "milestone_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks"
	ADD CONSTRAINT "tasks_milestone_id_milestones_id_fk"
	FOREIGN KEY ("milestone_id") REFERENCES "public"."milestones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- Indexes
CREATE INDEX "milestones_project_position_idx" ON "milestones" USING btree ("project_id","position");--> statement-breakpoint
CREATE INDEX "milestones_workspace_idx" ON "milestones" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "labels_workspace_name_lower_idx" ON "labels" USING btree ("workspace_id", lower("name"));--> statement-breakpoint
CREATE INDEX "subtasks_task_position_idx" ON "subtasks" USING btree ("task_id","position");--> statement-breakpoint
CREATE INDEX "subtasks_workspace_idx" ON "subtasks" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "tasks_milestone_idx" ON "tasks" USING btree ("milestone_id");--> statement-breakpoint

-- RLS: enable + policies. Tenant-scoped tables key on workspace_id =
-- current_workspace_id(). Join tables (task_labels, project_labels) key
-- via their parent row's workspace.
ALTER TABLE "milestones"     ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "labels"         ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_labels"    ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_labels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_links"     ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_links"  ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subtasks"       ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "milestones_isolation"     ON "milestones"     USING (workspace_id = current_workspace_id()) WITH CHECK (workspace_id = current_workspace_id());--> statement-breakpoint
CREATE POLICY "labels_isolation"         ON "labels"         USING (workspace_id = current_workspace_id()) WITH CHECK (workspace_id = current_workspace_id());--> statement-breakpoint
CREATE POLICY "task_links_isolation"     ON "task_links"     USING (workspace_id = current_workspace_id()) WITH CHECK (workspace_id = current_workspace_id());--> statement-breakpoint
CREATE POLICY "project_links_isolation"  ON "project_links"  USING (workspace_id = current_workspace_id()) WITH CHECK (workspace_id = current_workspace_id());--> statement-breakpoint
CREATE POLICY "subtasks_isolation"       ON "subtasks"       USING (workspace_id = current_workspace_id()) WITH CHECK (workspace_id = current_workspace_id());--> statement-breakpoint

-- Join tables: derive workspace from the parent row (task / project).
CREATE POLICY "task_labels_isolation" ON "task_labels"
	USING (
		EXISTS (
			SELECT 1 FROM tasks t
			WHERE t.id = task_labels.task_id
			  AND t.workspace_id = current_workspace_id()
		)
	)
	WITH CHECK (
		EXISTS (
			SELECT 1 FROM tasks t
			WHERE t.id = task_labels.task_id
			  AND t.workspace_id = current_workspace_id()
		)
		AND EXISTS (
			SELECT 1 FROM labels l
			WHERE l.id = task_labels.label_id
			  AND l.workspace_id = current_workspace_id()
		)
	);--> statement-breakpoint

CREATE POLICY "project_labels_isolation" ON "project_labels"
	USING (
		EXISTS (
			SELECT 1 FROM projects p
			WHERE p.id = project_labels.project_id
			  AND p.workspace_id = current_workspace_id()
		)
	)
	WITH CHECK (
		EXISTS (
			SELECT 1 FROM projects p
			WHERE p.id = project_labels.project_id
			  AND p.workspace_id = current_workspace_id()
		)
		AND EXISTS (
			SELECT 1 FROM labels l
			WHERE l.id = project_labels.label_id
			  AND l.workspace_id = current_workspace_id()
		)
	);
