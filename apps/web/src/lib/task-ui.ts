// Shared presentational metadata for tasks (list rows + board cards).

export type TaskType = "task" | "story" | "bug" | "epic";
export type TaskStatus = "open" | "in_progress" | "done";

export const TYPE_BADGE: Record<TaskType, { label: string; cls: string }> = {
  task: { label: "T", cls: "bg-gray-100 text-gray-600" },
  story: { label: "S", cls: "bg-sky-100 text-sky-700" },
  bug: { label: "B", cls: "bg-red-100 text-red-700" },
  epic: { label: "E", cls: "bg-violet-100 text-violet-700" },
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
};

export function initials(name: string): string {
  const parts = name.trim().split(/[\s@.]+/u).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const second = parts.length > 1 ? (parts[1]?.[0] ?? "") : (parts[0]?.[1] ?? "");
  return (first + second).toUpperCase();
}

export function isOverdue(dueAt: string | null, status: TaskStatus): boolean {
  return Boolean(dueAt && dueAt < new Date().toISOString().slice(0, 10) && status !== "done");
}
