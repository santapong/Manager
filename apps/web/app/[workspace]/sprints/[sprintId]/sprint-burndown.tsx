"use client";

// CSS-bar burndown — no chart library. Each bar is remaining story points on a
// given day; a dashed line marks the ideal linear burndown for reference.
// `remainingPoints` uses task points + updatedAt as a completion proxy (see
// server/sprints.ts), the same approximation the dashboard makes.
// Marked "use client" per the feature spec; the body is otherwise pure (props
// only) so it adds no runtime state.

import type { Burndown } from "@/src/server/sprints";

export function SprintBurndown({ data }: { data: Burndown }) {
  const { totalPoints, byDay } = data;

  if (totalPoints === 0) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
        No story points on this sprint yet. Add points to tasks to see a burndown.
      </div>
    );
  }

  if (byDay.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
        Set start and end dates on this sprint to chart its burndown.
      </div>
    );
  }

  const days = byDay.length;
  const max = Math.max(1, totalPoints);
  const remainingNow = byDay[byDay.length - 1]?.remainingPoints ?? totalPoints;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
        <span className="tabular-nums">{remainingNow} pts remaining</span>
        <span className="tabular-nums">{totalPoints} pts total</span>
      </div>
      <div
        className="relative flex h-40 items-end gap-1 border-b border-l border-gray-200 pl-1"
        role="img"
        aria-label={`Burndown over ${days} day${days === 1 ? "" : "s"}: ${remainingNow} of ${totalPoints} points remaining`}
      >
        {/* Ideal burndown reference: from full at day 0 to zero on the last day. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(to top right, transparent calc(50% - 0.5px), rgb(203 213 225) calc(50% - 0.5px), rgb(203 213 225) calc(50% + 0.5px), transparent calc(50% + 0.5px))",
          }}
        />
        {byDay.map((d) => {
          const pct = (d.remainingPoints / max) * 100;
          return (
            <div
              key={d.day}
              title={`${d.day}: ${d.remainingPoints} pts remaining`}
              className="relative flex-1 rounded-t bg-brand-500/80"
              style={{ height: `${Math.max(2, pct)}%` }}
            />
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-gray-400">
        <span>{byDay[0]?.day}</span>
        <span>{byDay[byDay.length - 1]?.day}</span>
      </div>
    </div>
  );
}
