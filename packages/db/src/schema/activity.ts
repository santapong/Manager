import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { tasks } from "./tasks";
import { users } from "./users";
import { workspaces } from "./workspaces";

export const ACTIVITY_TYPES = [
  "task_created",
  "status_changed",
  "assignee_changed",
  "priority_changed",
  "type_changed",
  "due_changed",
  "points_changed",
  "milestone_changed",
  "comment_added",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

// Append-only audit trail per task. No update path by design.
export const activity = pgTable(
  "activity",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    // Null actor = API/MCP writes without a browser session.
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    type: text("type", { enum: ACTIVITY_TYPES }).notNull(),
    // {from, to} for field changes; {commentId} for comment_added.
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    byTask: index("activity_task_created_idx").on(table.taskId, table.createdAt.desc()),
    byProject: index("activity_project_created_idx").on(table.projectId, table.createdAt.desc()),
  }),
);

export type Activity = typeof activity.$inferSelect;
export type NewActivity = typeof activity.$inferInsert;
