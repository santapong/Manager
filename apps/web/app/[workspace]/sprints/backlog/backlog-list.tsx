"use client";

// Backlog list with per-row "move to sprint" control. Client because each row
// fires assignTaskAction in a transition and the moved task is optimistically
// removed from the list (reverts on server error). Project filter is a plain
// <select> that navigates with a ?project= query param (server re-queries).

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TYPE_BADGE, type TaskStatus, type TaskType } from "@/src/lib/task-ui";
import { assignTaskAction } from "../actions";

export interface BacklogRow {
  id: string;
  key: string;
  title: string;
  status: TaskStatus;
  priority: "low" | "medium" | "high" | "urgent";
  type: TaskType;
  points: number | null;
  projectId: string;
  projectKey: string;
}

export interface SprintChoice {
  id: string;
  name: string;
  status: "planned" | "active" | "completed";
}

const PRIORITY_DOT: Record<BacklogRow["priority"], string> = {
  low: "bg-gray-300",
  medium: "bg-sky-400",
  high: "bg-amber-400",
  urgent: "bg-red-500",
};

export function BacklogList({
  workspaceSlug,
  projects,
  selectedProjectId,
  tasks,
  sprintsByProject,
}: {
  workspaceSlug: string;
  projects: { id: string; key: string; name: string }[];
  selectedProjectId: string | null;
  tasks: BacklogRow[];
  /** projectId → assignable (active/planned) sprints for that project. */
  sprintsByProject: Record<string, SprintChoice[]>;
}) {
  const router = useRouter();
  // Optimistic: remove a task from the list as soon as it's assigned.
  const [optimisticTasks, removeTask] = useOptimistic(tasks, (state, removedId: string) =>
    state.filter((t) => t.id !== removedId),
  );

  function onFilterChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    router.push(v ? `/${workspaceSlug}/sprints/backlog?project=${v}` : `/${workspaceSlug}/sprints/backlog`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <label htmlFor="backlog-project" className="text-sm text-gray-600">
          Project
        </label>
        <select
          id="backlog-project"
          value={selectedProjectId ?? ""}
          onChange={onFilterChange}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.key})
            </option>
          ))}
        </select>
      </div>

      {optimisticTasks.length === 0 ? (
        <p className="rounded-md border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          The backlog is empty. Tasks without a sprint show up here.
        </p>
      ) : (
        <ul className="divide-y divide-gray-200 rounded-md border border-gray-200">
          {optimisticTasks.map((t) => (
            <BacklogItem
              key={t.id}
              workspaceSlug={workspaceSlug}
              task={t}
              sprints={sprintsByProject[t.projectId] ?? []}
              onAssigned={removeTask}
              priorityDot={PRIORITY_DOT[t.priority]}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function BacklogItem({
  workspaceSlug,
  task,
  sprints,
  onAssigned,
  priorityDot,
}: {
  workspaceSlug: string;
  task: BacklogRow;
  sprints: SprintChoice[];
  onAssigned: (id: string) => void;
  priorityDot: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onPick(e: React.ChangeEvent<HTMLSelectElement>) {
    const sprintId = e.target.value;
    if (!sprintId) return;
    setError(null);
    startTransition(async () => {
      onAssigned(task.id); // optimistic removal
      const res = await assignTaskAction(workspaceSlug, { taskId: task.id, sprintId });
      if (res && "error" in res && res.error) setError(res.error);
    });
    e.target.value = "";
  }

  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-gray-50">
      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden
          title={task.type}
          className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-semibold ${TYPE_BADGE[task.type].cls}`}
        >
          {TYPE_BADGE[task.type].label}
        </span>
        <span className="font-mono text-xs text-gray-500">{task.key}</span>
        <span
          aria-label={`Priority: ${task.priority}`}
          title={task.priority}
          className={`h-2 w-2 shrink-0 rounded-full ${priorityDot}`}
        />
        <span className="truncate text-sm">{task.title}</span>
        {task.points != null ? (
          <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-gray-600">
            {task.points} pts
          </span>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {error ? (
          <span role="alert" className="text-xs text-red-600">
            {error}
          </span>
        ) : null}
        {sprints.length === 0 ? (
          <span className="text-xs text-gray-400">No open sprint</span>
        ) : (
          <select
            aria-label={`Move ${task.key} to a sprint`}
            defaultValue=""
            disabled={pending}
            onChange={onPick}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm disabled:opacity-50"
          >
            <option value="" disabled>
              {pending ? "Moving…" : "Move to sprint…"}
            </option>
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.status === "active" ? " (active)" : ""}
              </option>
            ))}
          </select>
        )}
      </div>
    </li>
  );
}
