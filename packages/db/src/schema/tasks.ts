import { type AnyPgColumn, index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { lists } from "./lists";
import { milestones } from "./milestones";
import { projects } from "./projects";
import { users } from "./users";
import { workspaces } from "./workspaces";

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    listId: uuid("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    milestoneId: uuid("milestone_id").references((): AnyPgColumn => milestones.id, {
      onDelete: "set null",
    }),
    key: text("key").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status", { enum: ["open", "in_progress", "done"] }).notNull().default("open"),
    priority: text("priority", { enum: ["low", "medium", "high", "urgent"] })
      .notNull()
      .default("medium"),
    type: text("type", { enum: ["task", "story", "bug", "epic"] }).notNull().default("task"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    points: integer("points"),
    position: integer("position").notNull().default(0),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    keyPerProject: unique().on(table.projectId, table.key),
    byList: index("tasks_list_idx").on(table.listId, table.position),
    byWorkspaceUpdated: index("tasks_workspace_updated_idx").on(table.workspaceId, table.updatedAt),
    byMilestone: index("tasks_milestone_idx").on(table.milestoneId),
  }),
);

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
