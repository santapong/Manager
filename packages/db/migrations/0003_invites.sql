-- Workspace member invites — Phase 1 PR 2.
--
-- New table: invites. Email invites with hashed single-use tokens (same
-- scheme as magic-link verification_tokens). One pending invite per email
-- per workspace; accepted rows are kept as history.
--
-- RLS: standard workspace isolation, like memberships. The accept flow
-- looks the row up by token hash WITHOUT workspace context (the invitee
-- is not a member yet) over the owner connection — the same precedent as
-- session/verification-token lookups and the /welcome onboarding inserts.

CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invites_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "invites_role_check" CHECK ("role" IN ('admin','member','guest'))
);
--> statement-breakpoint
ALTER TABLE "invites"
	ADD CONSTRAINT "invites_workspace_id_workspaces_id_fk"
	FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites"
	ADD CONSTRAINT "invites_invited_by_users_id_fk"
	FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "invites_workspace_idx" ON "invites" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invites_workspace_email_pending_idx" ON "invites" USING btree ("workspace_id", lower("email")) WHERE accepted_at IS NULL;--> statement-breakpoint

ALTER TABLE "invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "invites_isolation" ON "invites" USING (workspace_id = current_workspace_id()) WITH CHECK (workspace_id = current_workspace_id());
