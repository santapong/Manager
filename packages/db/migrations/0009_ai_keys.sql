-- Per-workspace AI provider key (BYO key) — Wave 2a / ADR 0002.
--
-- Stores ONLY an AES-256-GCM ciphertext (base64 packed blob) + last4 for
-- display. Plaintext keys are never stored. Workspace RLS isolation; app
-- additionally gates writes to owner/admin.

CREATE TABLE "workspace_ai_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" text DEFAULT 'anthropic' NOT NULL,
	"ciphertext" text NOT NULL,
	"last4" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_ai_keys_ws_provider_uq" UNIQUE("workspace_id","provider")
);
--> statement-breakpoint

ALTER TABLE "workspace_ai_keys"
	ADD CONSTRAINT "workspace_ai_keys_workspace_id_workspaces_id_fk"
	FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_ai_keys"
	ADD CONSTRAINT "workspace_ai_keys_created_by_users_id_fk"
	FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "workspace_ai_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "workspace_ai_keys_isolation" ON "workspace_ai_keys" USING (workspace_id = current_workspace_id()) WITH CHECK (workspace_id = current_workspace_id());
