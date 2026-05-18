import { check, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { projects } from "./projects";
import { tasks } from "./tasks";
import { workspaces } from "./workspaces";

export const taskLinks = pgTable(
  "task_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    fromTaskId: uuid("from_task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    toTaskId: uuid("to_task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["blocks", "relates", "duplicates"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    unq: unique("task_links_from_to_type_unique").on(table.fromTaskId, table.toTaskId, table.type),
    noSelf: check("task_links_no_self_check", sql`${table.fromTaskId} <> ${table.toTaskId}`),
  }),
);

export type TaskLink = typeof taskLinks.$inferSelect;
export type NewTaskLink = typeof taskLinks.$inferInsert;
export type TaskLinkType = TaskLink["type"];

export const projectLinks = pgTable(
  "project_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    fromProjectId: uuid("from_project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    toProjectId: uuid("to_project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["depends_on", "relates"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    unq: unique("project_links_from_to_type_unique").on(
      table.fromProjectId,
      table.toProjectId,
      table.type,
    ),
    noSelf: check(
      "project_links_no_self_check",
      sql`${table.fromProjectId} <> ${table.toProjectId}`,
    ),
  }),
);

export type ProjectLink = typeof projectLinks.$inferSelect;
export type NewProjectLink = typeof projectLinks.$inferInsert;
export type ProjectLinkType = ProjectLink["type"];
