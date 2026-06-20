"use client";

// Presentational widget renderers for the dashboard. Marked "use client" so it
// can be imported by the draggable dashboard (which is a client tree) and so
// the pomodoro widget can mount the interactive timer. These components are
// otherwise pure — all data arrives via props.

import { PomodoroTimer } from "@/components/pomodoro/pomodoro-timer";
import type { WidgetType } from "@/src/lib/validators/dashboard";
import type { WorkspaceStats } from "@/src/server/dashboard";
import type { PomodoroStats } from "@/src/server/pomodoro";

export const WIDGET_META: Record<WidgetType, { title: string }> = {
  tasks_done: { title: "Tasks done" },
  by_status: { title: "By status" },
  by_priority: { title: "By priority" },
  due_overdue: { title: "Overdue" },
  my_tasks: { title: "My open tasks" },
  completions_chart: { title: "Completed (14 days)" },
  pomodoro: { title: "Pomodoro" },
};

export interface WidgetProps {
  type: WidgetType;
  workspaceSlug: string;
  stats: WorkspaceStats;
  pomodoroStats: PomodoroStats;
}

/** Switch from widget `type` to its renderer. */
export function WidgetBody({ type, workspaceSlug, stats, pomodoroStats }: WidgetProps) {
  switch (type) {
    case "tasks_done":
      return <TasksDone stats={stats} />;
    case "by_status":
      return <ByStatus stats={stats} />;
    case "by_priority":
      return <ByPriority stats={stats} />;
    case "due_overdue":
      return <DueOverdue stats={stats} />;
    case "my_tasks":
      return <MyTasks stats={stats} pomodoroStats={pomodoroStats} />;
    case "completions_chart":
      return <CompletionsChart stats={stats} />;
    case "pomodoro":
      return <PomodoroTimer workspaceSlug={workspaceSlug} />;
    default:
      return <Unknown />;
  }
}

function Unknown() {
  return <p className="text-sm text-gray-500">Unknown widget.</p>;
}

function TasksDone({ stats }: { stats: WorkspaceStats }) {
  return (
    <div>
      <p className="text-3xl font-semibold tabular-nums text-gray-900">{stats.doneTotal}</p>
      <p className="mt-1 text-sm text-gray-500">
        {stats.doneLast7d > 0 ? `+${stats.doneLast7d} this week` : "No completions this week"}
      </p>
    </div>
  );
}

const STATUS_ROWS: { key: keyof WorkspaceStats["byStatus"]; label: string; bar: string }[] = [
  { key: "open", label: "Open", bar: "bg-gray-300" },
  { key: "in_progress", label: "In progress", bar: "bg-sky-400" },
  { key: "done", label: "Done", bar: "bg-emerald-500" },
];

function ByStatus({ stats }: { stats: WorkspaceStats }) {
  const max = Math.max(1, ...STATUS_ROWS.map((r) => stats.byStatus[r.key]));
  return (
    <ul className="space-y-2">
      {STATUS_ROWS.map((r) => {
        const v = stats.byStatus[r.key];
        return (
          <li key={r.key}>
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span>{r.label}</span>
              <span className="tabular-nums">{v}</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className={`h-full rounded-full ${r.bar}`}
                style={{ width: `${(v / max) * 100}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const PRIORITY_ROWS: { key: keyof WorkspaceStats["byPriority"]; label: string; dot: string }[] = [
  { key: "urgent", label: "Urgent", dot: "bg-red-500" },
  { key: "high", label: "High", dot: "bg-orange-400" },
  { key: "medium", label: "Medium", dot: "bg-amber-400" },
  { key: "low", label: "Low", dot: "bg-gray-300" },
];

function ByPriority({ stats }: { stats: WorkspaceStats }) {
  return (
    <ul className="space-y-2">
      {PRIORITY_ROWS.map((r) => (
        <li key={r.key} className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 text-gray-600">
            <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${r.dot}`} />
            {r.label}
          </span>
          <span className="tabular-nums text-gray-900">{stats.byPriority[r.key]}</span>
        </li>
      ))}
    </ul>
  );
}

function DueOverdue({ stats }: { stats: WorkspaceStats }) {
  const over = stats.overdue > 0;
  return (
    <div>
      <p
        className={`text-3xl font-semibold tabular-nums ${over ? "text-red-600" : "text-gray-900"}`}
      >
        {stats.overdue}
      </p>
      <p className="mt-1 text-sm text-gray-500">
        {over ? "tasks past due" : "Nothing overdue"}
      </p>
    </div>
  );
}

function MyTasks({
  stats,
  pomodoroStats,
}: {
  stats: WorkspaceStats;
  pomodoroStats: PomodoroStats;
}) {
  return (
    <div>
      <p className="text-3xl font-semibold tabular-nums text-gray-900">{stats.myOpen}</p>
      <p className="mt-1 text-sm text-gray-500">assigned to you, not done</p>
      <p className="mt-2 text-xs text-gray-400">
        {pomodoroStats.focusToday} focus session{pomodoroStats.focusToday === 1 ? "" : "s"} today
        {pomodoroStats.focusMinutesToday > 0 ? ` · ${pomodoroStats.focusMinutesToday} min` : ""}
      </p>
    </div>
  );
}

function CompletionsChart({ stats }: { stats: WorkspaceStats }) {
  const data = stats.completionsByDay;
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((sum, d) => sum + d.count, 0);

  if (total === 0) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
        No completions in the last 14 days.
      </div>
    );
  }

  return (
    <div>
      <div
        className="flex h-24 items-end gap-1"
        role="img"
        aria-label={`Completions over the last 14 days, ${total} total`}
      >
        {data.map((d) => (
          <div
            key={d.day}
            title={`${d.day}: ${d.count}`}
            className="flex-1 rounded-t bg-brand-500/80"
            style={{ height: `${Math.max(2, (d.count / max) * 100)}%` }}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-gray-400">{total} completed in 14 days</p>
    </div>
  );
}
