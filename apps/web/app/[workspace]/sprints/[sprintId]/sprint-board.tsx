"use client";

// Status board for a sprint's tasks — column per status, drag/drop via dnd-kit,
// same pattern as the project board (board.tsx). Moves apply to local state
// instantly; moveSprintTaskAction recomputes the fractional position server-side
// and revalidates, so state re-syncs from props. Needs interactivity → client.

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { STATUS_LABEL, TYPE_BADGE, type TaskStatus, type TaskType } from "@/src/lib/task-ui";
import { moveSprintTaskAction } from "../actions";

export interface SprintBoardTask {
  id: string;
  key: string;
  title: string;
  status: TaskStatus;
  priority: "low" | "medium" | "high" | "urgent";
  type: TaskType;
  points: number | null;
}

const PRIORITY_DOT: Record<SprintBoardTask["priority"], string> = {
  low: "bg-gray-300",
  medium: "bg-sky-400",
  high: "bg-amber-400",
  urgent: "bg-red-500",
};

const STATUSES: TaskStatus[] = ["open", "in_progress", "done"];
const COLUMN_PREFIX = "col:";
const columnId = (status: TaskStatus) => `${COLUMN_PREFIX}${status}`;

type Columns = Record<TaskStatus, string[]>;

function groupIds(tasks: SprintBoardTask[]): Columns {
  const cols: Columns = { open: [], in_progress: [], done: [] };
  for (const t of tasks) cols[t.status].push(t.id);
  return cols;
}

export function SprintBoard({
  workspaceSlug,
  sprintId,
  tasks,
}: {
  workspaceSlug: string;
  sprintId: string;
  tasks: SprintBoardTask[];
}) {
  const [columns, setColumns] = useState<Columns>(() => groupIds(tasks));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t] as const)), [tasks]);

  // Re-sync from server props after revalidation — but never mid-drag.
  useEffect(() => {
    if (!activeId) setColumns(groupIds(tasks));
  }, [tasks, activeId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function findColumn(id: string): TaskStatus | undefined {
    if (id.startsWith(COLUMN_PREFIX)) return id.slice(COLUMN_PREFIX.length) as TaskStatus;
    return STATUSES.find((s) => columns[s].includes(id));
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeKey = String(active.id);
    const overKey = String(over.id);
    const from = findColumn(activeKey);
    const to = findColumn(overKey);
    if (!from || !to || from === to) return;

    setColumns((prev) => {
      const fromIds = prev[from].filter((i) => i !== activeKey);
      const toIds = prev[to].filter((i) => i !== activeKey);
      const overIndex = overKey.startsWith(COLUMN_PREFIX) ? toIds.length : toIds.indexOf(overKey);
      toIds.splice(overIndex < 0 ? toIds.length : overIndex, 0, activeKey);
      return { ...prev, [from]: fromIds, [to]: toIds };
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;
    const activeKey = String(active.id);
    const overKey = String(over.id);
    const to = findColumn(overKey);
    if (!to) return;

    const ids = columns[to];
    const oldIndex = ids.indexOf(activeKey);
    if (oldIndex < 0) return; // dragOver already settled cross-column state
    let newIndex = overKey.startsWith(COLUMN_PREFIX) ? ids.length - 1 : ids.indexOf(overKey);
    if (newIndex < 0) newIndex = ids.length - 1;
    const next = oldIndex === newIndex ? ids : arrayMove(ids, oldIndex, newIndex);
    if (next !== ids) setColumns((prev) => ({ ...prev, [to]: next }));

    const idx = next.indexOf(activeKey);
    const beforeId = idx > 0 ? next[idx - 1]! : null;
    const afterId = idx < next.length - 1 ? next[idx + 1]! : null;
    startTransition(async () => {
      await moveSprintTaskAction(workspaceSlug, sprintId, {
        id: activeKey,
        status: to,
        beforeId,
        afterId,
      });
    });
  }

  const activeTask = activeId ? byId.get(activeId) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {STATUSES.map((status) => (
          <SprintColumn key={status} status={status} taskIds={columns[status]} byId={byId} />
        ))}
      </div>
      <DragOverlay>{activeTask ? <CardContent task={activeTask} /> : null}</DragOverlay>
    </DndContext>
  );
}

function SprintColumn({
  status,
  taskIds,
  byId,
}: {
  status: TaskStatus;
  taskIds: string[];
  byId: Map<string, SprintBoardTask>;
}) {
  const { setNodeRef } = useDroppable({ id: columnId(status) });
  return (
    <section
      ref={setNodeRef}
      aria-label={`${STATUS_LABEL[status]} column`}
      className="flex min-h-48 flex-col rounded-lg bg-gray-50 p-2 ring-1 ring-gray-200"
    >
      <header className="flex items-center justify-between px-1.5 pb-2 pt-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {STATUS_LABEL[status]}
        </h3>
        <span className="text-xs text-gray-400">{taskIds.length}</span>
      </header>
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-1 flex-col gap-2">
          {taskIds.length === 0 ? (
            <li className="list-none rounded-md border border-dashed border-gray-200 px-2 py-4 text-center text-xs text-gray-400">
              Nothing here
            </li>
          ) : (
            taskIds.map((id) => {
              const task = byId.get(id);
              return task ? <SprintCard key={id} task={task} /> : null;
            })
          )}
        </ul>
      </SortableContext>
    </section>
  );
}

function CardContent({ task }: { task: SprintBoardTask }) {
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
      {task.points != null ? (
        <span className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-gray-600">
          {task.points} pts
        </span>
      ) : null}
    </div>
  );
}

function SprintCard({ task }: { task: SprintBoardTask }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      aria-label={`Card ${task.key}: ${task.title}`}
      className={`cursor-grab list-none active:cursor-grabbing ${isDragging ? "opacity-40" : ""}`}
    >
      <CardContent task={task} />
    </li>
  );
}
