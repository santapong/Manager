-- Dashboard + Pomodoro + Documents + GitHub integration.
--
-- New tables:
--   dashboard_layouts  — per-user draggable widget layout (one row per ws+user)
--   pomodoro_sessions  — completed focus/break intervals for stats
--   documents          — workspace wiki pages (Markdown body)
--   github_connections — repo linked to a workspace; inbound webhook secret
--   github_links       — task ↔ PR/branch links discovered from task keys
--
-- Standard workspace RLS on every table (workspace_id = current_workspace_id()).
-- User-scoped tables (dashboard_layouts, pomodoro_sessions) add app-level
-- user_id filters on top of tenant isolation.

CREATE TABLE "dashboard_layouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"layout" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pomodoro_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"task_id" uuid,
	"kind" text DEFAULT 'focus' NOT NULL,
	"minutes" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pomodoro_kind_check" CHECK ("kind" IN ('focus','short_break','long_break'))
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"owner" text NOT NULL,
	"repo" text NOT NULL,
	"webhook_secret" text NOT NULL,
	"connected_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_connections_ws_repo_uq" UNIQUE("workspace_id","owner","repo")
);
--> statement-breakpoint
CREATE TABLE "github_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"number" integer,
	"url" text NOT NULL,
	"title" text,
	"state" text,
	"merged" boolean DEFAULT false NOT NULL,
	"author" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_kind_check" CHECK ("kind" IN ('pull_request','issue','branch','commit')),
	CONSTRAINT "github_links_task_url_uq" UNIQUE("task_id","kind","url")
);
--> statement-breakpoint

-- Foreign keys
ALTER TABLE "dashboard_layouts"
	ADD CONSTRAINT "dashboard_layouts_workspace_id_workspaces_id_fk"
	FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_layouts"
	ADD CONSTRAINT "dashboard_layouts_user_id_users_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pomodoro_sessions"
	ADD CONSTRAINT "pomodoro_sessions_workspace_id_workspaces_id_fk"
	FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pomodoro_sessions"
	ADD CONSTRAINT "pomodoro_sessions_user_id_users_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pomodoro_sessions"
	ADD CONSTRAINT "pomodoro_sessions_task_id_tasks_id_fk"
	FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents"
	ADD CONSTRAINT "documents_workspace_id_workspaces_id_fk"
	FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents"
	ADD CONSTRAINT "documents_created_by_users_id_fk"
	FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents"
	ADD CONSTRAINT "documents_updated_by_users_id_fk"
	FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_connections"
	ADD CONSTRAINT "github_connections_workspace_id_workspaces_id_fk"
	FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_connections"
	ADD CONSTRAINT "github_connections_connected_by_users_id_fk"
	FOREIGN KEY ("connected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_links"
	ADD CONSTRAINT "github_links_workspace_id_workspaces_id_fk"
	FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_links"
	ADD CONSTRAINT "github_links_task_id_tasks_id_fk"
	FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Indexes
CREATE UNIQUE INDEX "dashboard_layouts_ws_user_idx" ON "dashboard_layouts" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "pomodoro_user_completed_idx" ON "pomodoro_sessions" USING btree ("workspace_id","user_id","completed_at");--> statement-breakpoint
CREATE INDEX "documents_workspace_updated_idx" ON "documents" USING btree ("workspace_id","updated_at");--> statement-breakpoint
CREATE INDEX "github_connections_repo_idx" ON "github_connections" USING btree ("owner","repo");--> statement-breakpoint
CREATE INDEX "github_links_task_idx" ON "github_links" USING btree ("task_id");--> statement-breakpoint

-- RLS
ALTER TABLE "dashboard_layouts"   ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pomodoro_sessions"   ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "documents"           ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "github_connections"  ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "github_links"        ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "dashboard_layouts_isolation"  ON "dashboard_layouts"  USING (workspace_id = current_workspace_id()) WITH CHECK (workspace_id = current_workspace_id());--> statement-breakpoint
CREATE POLICY "pomodoro_sessions_isolation"  ON "pomodoro_sessions"  USING (workspace_id = current_workspace_id()) WITH CHECK (workspace_id = current_workspace_id());--> statement-breakpoint
CREATE POLICY "documents_isolation"          ON "documents"          USING (workspace_id = current_workspace_id()) WITH CHECK (workspace_id = current_workspace_id());--> statement-breakpoint
CREATE POLICY "github_connections_isolation" ON "github_connections" USING (workspace_id = current_workspace_id()) WITH CHECK (workspace_id = current_workspace_id());--> statement-breakpoint
CREATE POLICY "github_links_isolation"       ON "github_links"       USING (workspace_id = current_workspace_id()) WITH CHECK (workspace_id = current_workspace_id());
