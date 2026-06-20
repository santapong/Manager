import { integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";
import { workspaces } from "./workspaces";

/**
 * Per-workspace AI provider API key (BYO key). The key is a real bearer
 * credential, so it is stored ENCRYPTED AT REST (AES-256-GCM): `ciphertext`
 * holds a base64 packed `version‖keyId‖iv‖authTag‖ciphertext` blob produced by
 * the web app's crypto util (master key from `AI_ENCRYPTION_KEY`). Plaintext is
 * never stored, logged, or sent to the model. `last4` is shown in the UI so the
 * user can recognize which key is set without revealing it. See ADR 0002.
 */
export const workspaceAiKeys = pgTable(
  "workspace_ai_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("anthropic"),
    /** base64 packed AES-256-GCM blob — never the raw key. */
    ciphertext: text("ciphertext").notNull(),
    /** Last 4 chars of the raw key, for display only. */
    last4: text("last4").notNull(),
    /** Encryption key version, for rotation of the master key. */
    keyVersion: integer("key_version").notNull().default(1),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    onePerWorkspaceProvider: unique("workspace_ai_keys_ws_provider_uq").on(
      table.workspaceId,
      table.provider,
    ),
  }),
);

export type WorkspaceAiKey = typeof workspaceAiKeys.$inferSelect;
export type NewWorkspaceAiKey = typeof workspaceAiKeys.$inferInsert;
