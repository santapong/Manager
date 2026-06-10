"use client";

// Kanban board — column per status, drag/drop via dnd-kit. Moves apply to
// local state instantly; the server action recomputes the fractional
// position from neighbor ids and revalidates (state re-syncs from props).

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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { TaskDrawer } from "@/components/task-drawer/task-drawer";
import { useProjectChannel } from "@/src/lib/realtime/use-channel";
import { STATUS_LABEL, type TaskStatus } from "@/src/lib/task-ui";
import { moveTaskAction } from "./actions";
import { BoardCard, BoardCardContent } from "./board-card";

export interface BoardTask {
  id: string;
  key: string;
  title: string;
  status: TaskStatus;
  priority: "low" | "medium" | "high" | "urgent";
  type: "task" | "story" | "bug" | "epic";
  dueAt: string | null;
  assignee: string | null;
}

const STATUSES: TaskStatus[] = ["open", "in_progress", "done"];

const COLUMN_PREFIX = "col:";
const columnId = (status: TaskStatus) => `${COLUMN_PREFIX}${status}`;

type Columns = Record<TaskStatus, string[]>;

function groupIds(tasks: BoardTask[]): Columns {
  const cols: Columns = { open: [], in_progress: [], done: [] };
  for (const t of tasks) cols[t.status].push(t.id);
  return cols;
}

export function Board({
  workspaceSlug,
  projectKey,
  tasks,
  channel = null,
}: {
  workspaceSlug: string;
  projectKey: string;
  tasks: BoardTask[];
  /** Realtime channel name, or null when realtime is not configured. */
  channel?: string | null;
}) {
  useProjectChannel(channel);
  const [columns, setColumns] = useState<Columns>(() => groupIds(tasks));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t] as const)), [tasks]);

  // Re-sync from the server-rendered props after revalidation — but never
  // mid-drag, or the card would jump out from under the pointer.
  useEffect(() => {
    if (!activeId) setColumns(groupIds(tasks));
  }, [tasks, activeId]);

  const sensors = useSensors(
    // distance > 0 keeps plain clicks (open drawer) from starting a drag.
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

  // Cross-column placement happens live so the drop preview is accurate.
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
      await moveTaskAction(workspaceSlug, projectKey, {
        id: activeKey,
        status: to,
        beforeId,
        afterId,
      });
    });
  }

  const activeTask = activeId ? byId.get(activeId) : undefined;

  return (
    <>
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
            <BoardColumn
              key={status}
              status={status}
              taskIds={columns[status]}
              byId={byId}
              onOpen={setDrawerTaskId}
            />
          ))}
        </div>
        <DragOverlay>
          {activeTask ? <BoardCardContent task={activeTask} /> : null}
        </DragOverlay>
      </DndContext>

      {drawerTaskId ? (
        <TaskDrawer
          workspaceSlug={workspaceSlug}
          projectKey={projectKey}
          taskId={drawerTaskId}
          open={drawerTaskId !== null}
          onClose={() => setDrawerTaskId(null)}
        />
      ) : null}
    </>
  );
}

function BoardColumn({
  status,
  taskIds,
  byId,
  onOpen,
}: {
  status: TaskStatus;
  taskIds: string[];
  byId: Map<string, BoardTask>;
  onOpen: (id: string) => void;
}) {
  const { setNodeRef } = useDroppable({ id: columnId(status) });

  return (
    <section
      ref={setNodeRef}
      aria-label={`${STATUS_LABEL[status]} column`}
      className="flex min-h-48 flex-col rounded-lg bg-gray-50 p-2 ring-1 ring-gray-200"
    >
      <header className="flex items-center justify-between px-1.5 pb-2 pt-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {STATUS_LABEL[status]}
        </h2>
        <span className="text-xs text-gray-400">{taskIds.length}</span>
      </header>
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-1 flex-col gap-2">
          {taskIds.map((id) => {
            const task = byId.get(id);
            return task ? <BoardCard key={id} task={task} onOpen={onOpen} /> : null;
          })}
        </ul>
      </SortableContext>
    </section>
  );
}
