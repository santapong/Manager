import { boolean, index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { tasks } from "./tasks";
import { users } from "./users";
import { workspaces } from "./workspaces";

/**
 * A repository connected to a workspace. Inbound webhooks are verified
 * against `webhookSecret` (HMAC-SHA256). We deliberately do NOT store a
 * GitHub access token here: the core flow (PRs/branches drive task status)
 * is fully inbound, so no encrypted-secret-at-rest requirement yet. The
 * webhook handler resolves the workspace by (owner, repo), so multiple
 * workspaces may connect the same repo independently.
 */
export const githubConnections = pgTable(
  "github_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    owner: text("owner").notNull(),
    repo: text("repo").notNull(),
    webhookSecret: text("webhook_secret").notNull(),
    connectedBy: uuid("connected_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    onePerWorkspace: unique("github_connections_ws_repo_uq").on(
      table.workspaceId,
      table.owner,
      table.repo,
    ),
    byRepo: index("github_connections_repo_idx").on(table.owner, table.repo),
  }),
);

export type GithubConnection = typeof githubConnections.$inferSelect;
export type NewGithubConnection = typeof githubConnections.$inferInsert;

/**
 * A link from a task to a GitHub object (PR, branch, …) discovered by
 * matching the task key in a PR title / branch name / body. PR state changes
 * upsert the matching row and can drive the task's status.
 */
export const githubLinks = pgTable(
  "github_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["pull_request", "issue", "branch", "commit"] }).notNull(),
    /** PR/issue number; null for branches/commits. */
    number: integer("number"),
    url: text("url").notNull(),
    title: text("title"),
    /** open | closed | merged (PRs/issues); null for branches. */
    state: text("state"),
    merged: boolean("merged").notNull().default(false),
    author: text("author"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqPerTask: unique("github_links_task_url_uq").on(table.taskId, table.kind, table.url),
    byTask: index("github_links_task_idx").on(table.taskId),
  }),
);

export type GithubLink = typeof githubLinks.$inferSelect;
export type NewGithubLink = typeof githubLinks.$inferInsert;
