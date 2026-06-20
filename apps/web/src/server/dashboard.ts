import { and, eq, sql } from "drizzle-orm";
import {
  dashboardLayouts,
  tasks,
  type Database,
  type DashboardWidgetConfig,
} from "@manager/db";

/**
 * Dashboard read/write service. All callers MUST run inside
 * `withActiveWorkspace` so the `app.workspace_id` GUC is set and RLS scopes
 * every query. Stats span ALL projects in the workspace; the dashboard layout
 * and pomodoro counts are per (workspace, user).
 */

export interface WorkspaceStats {
  total: number;
  byStatus: { open: number; in_progress: number; done: number };
  byPriority: { low: number; medium: number; high: number; urgent: number };
  doneTotal: number;
  /** status='done' updated within the last 7 days. */
  doneLast7d: number;
  /** dueAt in the past and not yet done. */
  overdue: number;
  /** Assigned to the current user and not done. */
  myOpen: number;
  /** Last 14 days of completions, oldest→newest, gaps filled with 0. */
  completionsByDay: { day: string; count: number }[];
}

const DAYS = 14;

/**
 * Single grouped pass over `tasks` for the scalar counts, plus one grouped
 * query for the 14-day completion histogram. `updatedAt` is used as a proxy
 * for completion time — there is no `completedAt` column on tasks, so a task
 * counts toward "done last 7d" / the chart based on when it was last touched.
 */
export async function getWorkspaceStats(
  db: Database,
  workspaceId: string,
  userId: string,
): Promise<WorkspaceStats> {
  const [counts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      open: sql<number>`count(*) filter (where ${tasks.status} = 'open')::int`,
      in_progress: sql<number>`count(*) filter (where ${tasks.status} = 'in_progress')::int`,
      done: sql<number>`count(*) filter (where ${tasks.status} = 'done')::int`,
      low: sql<number>`count(*) filter (where ${tasks.priority} = 'low')::int`,
      medium: sql<number>`count(*) filter (where ${tasks.priority} = 'medium')::int`,
      high: sql<number>`count(*) filter (where ${tasks.priority} = 'high')::int`,
      urgent: sql<number>`count(*) filter (where ${tasks.priority} = 'urgent')::int`,
      doneLast7d: sql<number>`count(*) filter (where ${tasks.status} = 'done' and ${tasks.updatedAt} >= now() - interval '7 days')::int`,
      overdue: sql<number>`count(*) filter (where ${tasks.dueAt} < now() and ${tasks.status} <> 'done')::int`,
      myOpen: sql<number>`count(*) filter (where ${tasks.assigneeId} = ${userId} and ${tasks.status} <> 'done')::int`,
    })
    .from(tasks)
    .where(eq(tasks.workspaceId, workspaceId));

  const c = counts ?? {
    total: 0,
    open: 0,
    in_progress: 0,
    done: 0,
    low: 0,
    medium: 0,
    high: 0,
    urgent: 0,
    doneLast7d: 0,
    overdue: 0,
    myOpen: 0,
  };

  // One grouped query: completions per calendar day over the window.
  const histogram = await db
    .select({
      day: sql<string>`to_char(date(${tasks.updatedAt}), 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        eq(tasks.status, "done"),
        sql`${tasks.updatedAt} >= (current_date - interval '${sql.raw(String(DAYS - 1))} days')`,
      ),
    )
    .groupBy(sql`date(${tasks.updatedAt})`);

  const byDay = new Map(histogram.map((r) => [r.day, r.count] as const));
  const completionsByDay = buildContinuousDays(DAYS, byDay);

  return {
    total: c.total,
    byStatus: { open: c.open, in_progress: c.in_progress, done: c.done },
    byPriority: { low: c.low, medium: c.medium, high: c.high, urgent: c.urgent },
    doneTotal: c.done,
    doneLast7d: c.doneLast7d,
    overdue: c.overdue,
    myOpen: c.myOpen,
    completionsByDay,
  };
}

/** Last `n` calendar days (UTC), oldest→newest, count pulled from `byDay` or 0. */
function buildContinuousDays(
  n: number,
  byDay: Map<string, number>,
): { day: string; count: number }[] {
  const out: { day: string; count: number }[] = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key, count: byDay.get(key) ?? 0 });
  }
  return out;
}

/** The user's saved widget order for this workspace, or [] if none stored yet. */
export async function getLayout(
  db: Database,
  workspaceId: string,
  userId: string,
): Promise<DashboardWidgetConfig[]> {
  const [row] = await db
    .select({ layout: dashboardLayouts.layout })
    .from(dashboardLayouts)
    .where(
      and(eq(dashboardLayouts.workspaceId, workspaceId), eq(dashboardLayouts.userId, userId)),
    )
    .limit(1);
  return row?.layout ?? [];
}

/** Upsert the user's layout for this workspace (unique on workspace+user). */
export async function saveLayout(
  db: Database,
  workspaceId: string,
  userId: string,
  layout: DashboardWidgetConfig[],
): Promise<void> {
  await db
    .insert(dashboardLayouts)
    .values({ workspaceId, userId, layout })
    .onConflictDoUpdate({
      target: [dashboardLayouts.workspaceId, dashboardLayouts.userId],
      set: { layout, updatedAt: new Date() },
    });
}
