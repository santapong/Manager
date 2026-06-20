import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { users } from "./users";
import { workspaces } from "./workspaces";

/**
 * Sprints — time-boxed iterations within a project (Phase 2). Tasks point at a
 * sprint via `tasks.sprint_id`; backlog = tasks with `sprint_id IS NULL`.
 * Burndown is computed from member `points` of the sprint's tasks.
 */
export const sprints = pgTable(
  "sprints",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    goal: text("goal"),
    startAt: timestamp("start_at", { withTimezone: true }),
    endAt: timestamp("end_at", { withTimezone: true }),
    status: text("status", { enum: ["planned", "active", "completed"] })
      .notNull()
      .default("planned"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    byProjectStatus: index("sprints_project_status_idx").on(table.projectId, table.status),
  }),
);

export type Sprint = typeof sprints.$inferSelect;
export type NewSprint = typeof sprints.$inferInsert;
