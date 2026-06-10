"use client";

import { useOptimistic, useState, useTransition } from "react";
import { deleteTask, updateTask } from "./actions";
import { TaskDrawer } from "@/components/task-drawer/task-drawer";
import { initials, isOverdue, STATUS_LABEL, TYPE_BADGE } from "@/src/lib/task-ui";

type Task = {
  id: string;
  key: string;
  title: string;
  status: "open" | "in_progress" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  type: "task" | "story" | "bug" | "epic";
  dueAt: string | null; // YYYY-MM-DD
  assignee: string | null; // display name
};

const STATUS_NEXT: Record<Task["status"], Task["status"]> = {
  open: "in_progress",
  in_progress: "done",
  done: "open",
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
  initialOpen = false,
}: {
  workspaceSlug: string;
  projectKey: string;
  task: Task;
  /** Open the drawer on mount — used by ?task= deep links from the inbox. */
  initialOpen?: boolean;
}) {
  const [optimistic, applyOptimistic] = useOptimistic(task, (state, patch: Partial<Task>) => ({
    ...state,
    ...patch,
  }));
  const [pending, startTransition] = useTransition();
  const [drawerOpen, setDrawerOpen] = useState(initialOpen);

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
        aria-label={`Type: ${optimistic.type}`}
        title={optimistic.type}
        className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-semibold ${TYPE_BADGE[optimistic.type].cls}`}
      >
        {TYPE_BADGE[optimistic.type].label}
      </span>
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        aria-label={`Open task ${optimistic.key}`}
        className={`flex-1 truncate text-left hover:text-brand-700 hover:underline ${
          optimistic.status === "done" ? "text-gray-400 line-through" : ""
        }`}
      >
        {optimistic.title}
      </button>
      {optimistic.dueAt ? (
        <span
          title={`Due ${optimistic.dueAt}`}
          className={`shrink-0 font-mono text-xs ${
            isOverdue(optimistic.dueAt, optimistic.status)
              ? "font-semibold text-red-600"
              : "text-gray-500"
          }`}
        >
          {optimistic.dueAt}
        </span>
      ) : null}
      {optimistic.assignee ? (
        <span
          title={`Assigned to ${optimistic.assignee}`}
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[10px] font-semibold text-brand-700 ring-1 ring-gray-300"
        >
          {initials(optimistic.assignee)}
        </span>
      ) : null}
      <span className="text-xs uppercase text-gray-400">{optimistic.priority}</span>
      <button
        type="button"
        onClick={onDelete}
        className="text-xs text-gray-400 hover:text-red-600"
      >
        delete
      </button>
      <TaskDrawer
        workspaceSlug={workspaceSlug}
        projectKey={projectKey}
        taskId={optimistic.id}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </li>
  );
}
