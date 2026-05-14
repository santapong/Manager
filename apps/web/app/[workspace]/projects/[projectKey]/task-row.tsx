"use client";

import { useOptimistic, useTransition } from "react";
import { deleteTask, updateTask } from "./actions";

type Task = {
  id: string;
  key: string;
  title: string;
  status: "open" | "in_progress" | "done";
  priority: "low" | "medium" | "high" | "urgent";
};

const STATUS_NEXT: Record<Task["status"], Task["status"]> = {
  open: "in_progress",
  in_progress: "done",
  done: "open",
};

const STATUS_LABEL: Record<Task["status"], string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
};

const STATUS_DOT: Record<Task["status"], string> = {
  open: "bg-gray-300",
  in_progress: "bg-amber-400",
  done: "bg-green-500",
};

export function TaskRow({
  workspaceSlug,
  projectKey,
  task,
}: {
  workspaceSlug: string;
  projectKey: string;
  task: Task;
}) {
  const [optimistic, applyOptimistic] = useOptimistic(task, (state, patch: Partial<Task>) => ({
    ...state,
    ...patch,
  }));
  const [pending, startTransition] = useTransition();

  function cycleStatus() {
    const next = STATUS_NEXT[optimistic.status];
    startTransition(async () => {
      applyOptimistic({ status: next });
      const fd = new FormData();
      fd.append("id", optimistic.id);
      fd.append("status", next);
      await updateTask(workspaceSlug, projectKey, fd);
    });
  }

  function onDelete() {
    if (!confirm(`Delete ${optimistic.key}?`)) return;
    startTransition(async () => {
      applyOptimistic({ title: `(deleting…) ${optimistic.title}` });
      const fd = new FormData();
      fd.append("id", optimistic.id);
      await deleteTask(workspaceSlug, projectKey, fd);
    });
  }

  return (
    <li className={`flex items-center gap-3 px-4 py-2.5 text-sm ${pending ? "opacity-60" : ""}`}>
      <button
        type="button"
        onClick={cycleStatus}
        aria-label={`Status: ${STATUS_LABEL[optimistic.status]}`}
        title={`Click to mark ${STATUS_LABEL[STATUS_NEXT[optimistic.status]].toLowerCase()}`}
        className={`h-3.5 w-3.5 rounded-full ${STATUS_DOT[optimistic.status]} ring-1 ring-gray-300 hover:ring-gray-400`}
      />
      <span className="w-16 shrink-0 font-mono text-xs text-gray-500">{optimistic.key}</span>
      <span
        className={`flex-1 ${optimistic.status === "done" ? "text-gray-400 line-through" : ""}`}
      >
        {optimistic.title}
      </span>
      <span className="text-xs uppercase text-gray-400">{optimistic.priority}</span>
      <button
        type="button"
        onClick={onDelete}
        className="text-xs text-gray-400 hover:text-red-600"
      >
        delete
      </button>
    </li>
  );
}
