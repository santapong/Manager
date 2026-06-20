import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tasks } from "./tasks";
import { users } from "./users";
import { workspaces } from "./workspaces";

/**
 * Completed Pomodoro sessions. The live countdown runs client-side; a row is
 * inserted only when an interval completes, so counts ("focus sessions today")
 * are durable and can power a dashboard widget. `taskId` optionally ties a
 * focus block to the task the user was working on.
 */
export const pomodoroSessions = pgTable(
  "pomodoro_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    kind: text("kind", { enum: ["focus", "short_break", "long_break"] })
      .notNull()
      .default("focus"),
    minutes: integer("minutes").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    byUser: index("pomodoro_user_completed_idx").on(
      table.workspaceId,
      table.userId,
      table.completedAt,
    ),
  }),
);

export type PomodoroSession = typeof pomodoroSessions.$inferSelect;
export type NewPomodoroSession = typeof pomodoroSessions.$inferInsert;
