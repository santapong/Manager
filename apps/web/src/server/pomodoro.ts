import { and, eq, gte, sql } from "drizzle-orm";
import { pomodoroSessions, type Database } from "@manager/db";

/**
 * Pomodoro persistence. A row is inserted only when an interval completes
 * (the countdown itself runs client-side), so counts are durable. Callers MUST
 * run inside `withActiveWorkspace` so RLS scopes every query.
 */

export interface LogSessionInput {
  workspaceId: string;
  userId: string;
  kind: "focus" | "short_break" | "long_break";
  minutes: number;
  startedAt: Date;
  taskId?: string;
}

export async function logSession(db: Database, input: LogSessionInput): Promise<void> {
  await db.insert(pomodoroSessions).values({
    workspaceId: input.workspaceId,
    userId: input.userId,
    kind: input.kind,
    minutes: input.minutes,
    startedAt: input.startedAt,
    taskId: input.taskId ?? null,
  });
}

export interface PomodoroStats {
  focusToday: number;
  focusMinutesToday: number;
}

/** Completed focus sessions (and their summed minutes) since local midnight. */
export async function getStats(
  db: Database,
  workspaceId: string,
  userId: string,
): Promise<PomodoroStats> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [row] = await db
    .select({
      focusToday: sql<number>`count(*)::int`,
      focusMinutesToday: sql<number>`coalesce(sum(${pomodoroSessions.minutes}), 0)::int`,
    })
    .from(pomodoroSessions)
    .where(
      and(
        eq(pomodoroSessions.workspaceId, workspaceId),
        eq(pomodoroSessions.userId, userId),
        eq(pomodoroSessions.kind, "focus"),
        gte(pomodoroSessions.completedAt, startOfToday),
      ),
    );

  return {
    focusToday: row?.focusToday ?? 0,
    focusMinutesToday: row?.focusMinutesToday ?? 0,
  };
}
