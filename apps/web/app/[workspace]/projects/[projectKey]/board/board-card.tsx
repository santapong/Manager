"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { initials, isOverdue, TYPE_BADGE } from "@/src/lib/task-ui";
import type { BoardTask } from "./board";

const PRIORITY_DOT: Record<BoardTask["priority"], string> = {
  low: "bg-gray-300",
  medium: "bg-sky-400",
  high: "bg-amber-400",
  urgent: "bg-red-500",
};

/** Static card body — shared between the sortable card and the DragOverlay. */
export function BoardCardContent({ task }: { task: BoardTask }) {
  return (
    <div className="space-y-1.5 rounded-md border border-gray-200 bg-white p-2.5 shadow-sm">
      <div className="flex items-center gap-1.5">
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
          className={`ml-auto h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[task.priority]}`}
        />
      </div>
      <p className="text-sm leading-snug">{task.title}</p>
      {(task.dueAt || task.assignee) && (
        <div className="flex items-center gap-2">
          {task.dueAt ? (
            <span
              title={`Due ${task.dueAt}`}
              className={`font-mono text-[11px] ${
                isOverdue(task.dueAt, task.status) ? "font-semibold text-red-600" : "text-gray-500"
              }`}
            >
              {task.dueAt}
            </span>
          ) : null}
          {task.assignee ? (
            <span
              title={`Assigned to ${task.assignee}`}
              className="ml-auto inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-50 text-[10px] font-semibold text-brand-700 ring-1 ring-gray-300"
            >
              {initials(task.assignee)}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function BoardCard({ task, onOpen }: { task: BoardTask; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(task.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(task.id);
      }}
      aria-label={`Card ${task.key}: ${task.title}`}
      className={`cursor-grab list-none active:cursor-grabbing ${isDragging ? "opacity-40" : ""}`}
    >
      <BoardCardContent task={task} />
    </li>
  );
}
