import { jsonb, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { workspaces } from "./workspaces";

/**
 * A single widget instance on a user's dashboard. The full shape (which
 * widget types exist, their options) is owned by the web app and validated
 * in `src/lib/validators/dashboard.ts`; the DB only stores the ordered list.
 */
export interface DashboardWidgetConfig {
  /** Stable instance id (so two widgets of the same type can coexist). */
  id: string;
  /** Widget kind, e.g. "tasks_done" | "by_status" | "pomodoro". */
  type: string;
}

/**
 * Per-user, per-workspace dashboard layout. One row per (workspace, user).
 * `layout` is the ordered array of widgets the user has placed; reordering
 * on the draggable dashboard rewrites this array.
 */
export const dashboardLayouts = pgTable(
  "dashboard_layouts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    layout: jsonb("layout")
      .$type<DashboardWidgetConfig[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    perUser: uniqueIndex("dashboard_layouts_ws_user_idx").on(table.workspaceId, table.userId),
  }),
);

export type DashboardLayout = typeof dashboardLayouts.$inferSelect;
export type NewDashboardLayout = typeof dashboardLayouts.$inferInsert;
