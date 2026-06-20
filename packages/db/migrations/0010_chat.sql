-- Team chat — workspace channels (Wave 3). Channels + messages, workspace RLS.
-- v1 is channels only (DMs are a follow-up). Realtime fanout is via the
-- RealtimeService port; no schema involvement.

CREATE TABLE "chat_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"author_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "chat_channels"
	ADD CONSTRAINT "chat_channels_workspace_id_workspaces_id_fk"
	FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_channels"
	ADD CONSTRAINT "chat_channels_created_by_users_id_fk"
	FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages"
	ADD CONSTRAINT "chat_messages_workspace_id_workspaces_id_fk"
	FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages"
	ADD CONSTRAINT "chat_messages_channel_id_chat_channels_id_fk"
	FOREIGN KEY ("channel_id") REFERENCES "public"."chat_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages"
	ADD CONSTRAINT "chat_messages_author_id_users_id_fk"
	FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE UNIQUE INDEX "chat_channels_workspace_name_lower_idx" ON "chat_channels" USING btree ("workspace_id", lower("name"));--> statement-breakpoint
CREATE INDEX "chat_messages_channel_created_idx" ON "chat_messages" USING btree ("channel_id","created_at");--> statement-breakpoint

ALTER TABLE "chat_channels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chat_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "chat_channels_isolation" ON "chat_channels" USING (workspace_id = current_workspace_id()) WITH CHECK (workspace_id = current_workspace_id());--> statement-breakpoint
CREATE POLICY "chat_messages_isolation" ON "chat_messages" USING (workspace_id = current_workspace_id()) WITH CHECK (workspace_id = current_workspace_id());
