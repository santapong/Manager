"use client";

// Client component: the draggable widget grid. Widget reordering applies to
// local state instantly, then persists via saveLayoutAction inside a
// transition; the server revalidates and re-syncs from props. A drag handle
// per card means clicking inside a widget (e.g. the Pomodoro buttons) never
// starts a drag.

import { useEffect, useState, useTransition } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { DashboardWidgetConfig } from "@manager/db";
import { WidgetTypeSchema, type WidgetType } from "@/src/lib/validators/dashboard";
import type { WorkspaceStats } from "@/src/server/dashboard";
import type { PomodoroStats } from "@/src/server/pomodoro";
import { saveLayoutAction } from "./actions";
import { WIDGET_META, WidgetBody } from "./widgets";

const ALL_TYPES = WidgetTypeSchema.options;

/** Sensible starting layout when the user has never customised theirs. */
const DEFAULT_TYPES: WidgetType[] = [
  "tasks_done",
  "by_status",
  "my_tasks",
  "due_overdue",
  "completions_chart",
  "pomodoro",
];

function makeDefault(): DashboardWidgetConfig[] {
  return DEFAULT_TYPES.map((type) => ({ id: crypto.randomUUID(), type }));
}

/** Keep only widgets whose type we still know how to render. */
function sanitize(layout: DashboardWidgetConfig[]): DashboardWidgetConfig[] {
  return layout.filter((w): w is DashboardWidgetConfig =>
    (ALL_TYPES as readonly string[]).includes(w.type),
  );
}

export function Dashboard({
  workspaceSlug,
  stats,
  pomodoroStats,
  initialLayout,
}: {
  workspaceSlug: string;
  stats: WorkspaceStats;
  pomodoroStats: PomodoroStats;
  initialLayout: DashboardWidgetConfig[];
}) {
  const [layout, setLayout] = useState<DashboardWidgetConfig[]>(() => {
    const clean = sanitize(initialLayout);
    return clean.length > 0 ? clean : makeDefault();
  });
  const [pending, startTransition] = useTransition();

  // Re-sync from server-rendered props after a revalidation, but only when the
  // incoming layout is non-empty (an empty initial layout means "use default",
  // which we already materialised locally and don't want to clobber).
  useEffect(() => {
    const clean = sanitize(initialLayout);
    if (clean.length > 0) setLayout(clean);
  }, [initialLayout]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function persist(next: DashboardWidgetConfig[]) {
    startTransition(async () => {
      await saveLayoutAction(workspaceSlug, next);
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setLayout((prev) => {
      const oldIndex = prev.findIndex((w) => w.id === active.id);
      const newIndex = prev.findIndex((w) => w.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      const next = arrayMove(prev, oldIndex, newIndex);
      persist(next);
      return next;
    });
  }

  function addWidget(type: WidgetType) {
    setLayout((prev) => {
      const next = [...prev, { id: crypto.randomUUID(), type }];
      persist(next);
      return next;
    });
  }

  function removeWidget(id: string) {
    setLayout((prev) => {
      const next = prev.filter((w) => w.id !== id);
      persist(next);
      return next;
    });
  }

  const ids = layout.map((w) => w.id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500" aria-live="polite">
          {pending ? "Saving layout…" : `${layout.length} widget${layout.length === 1 ? "" : "s"}`}
        </p>
        <AddWidgetMenu onAdd={addWidget} />
      </div>

      {layout.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          No widgets yet. Add one to get started.
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {layout.map((w) => (
                <SortableWidget
                  key={w.id}
                  widget={w}
                  workspaceSlug={workspaceSlug}
                  stats={stats}
                  pomodoroStats={pomodoroStats}
                  onRemove={() => removeWidget(w.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function SortableWidget({
  widget,
  workspaceSlug,
  stats,
  pomodoroStats,
  onRemove,
}: {
  widget: DashboardWidgetConfig;
  workspaceSlug: string;
  stats: WorkspaceStats;
  pomodoroStats: PomodoroStats;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: widget.id });
  const type = widget.type as WidgetType;
  const title = WIDGET_META[type]?.title ?? widget.type;

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      aria-label={`${title} widget`}
      className={`rounded-md border border-gray-200 bg-white p-4 ${isDragging ? "z-10 opacity-60 shadow-md" : ""}`}
    >
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            ref={setActivatorNodeRef}
            aria-label={`Drag to reorder ${title}`}
            className="cursor-grab touch-none rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <DragHandleIcon />
          </button>
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${title}`}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <CloseIcon />
        </button>
      </header>
      <WidgetBody
        type={type}
        workspaceSlug={workspaceSlug}
        stats={stats}
        pomodoroStats={pomodoroStats}
      />
    </section>
  );
}

function AddWidgetMenu({ onAdd }: { onAdd: (type: WidgetType) => void }) {
  const [open, setOpen] = useState(false);

  // Close on Escape or outside click.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onClick() {
      setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    // defer so the opening click doesn't immediately close it
    const id = window.setTimeout(() => window.addEventListener("click", onClick), 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(id);
      window.removeEventListener("click", onClick);
    };
  }, [open]);

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        Add widget
      </button>
      {open ? (
        <ul
          role="menu"
          aria-label="Add a widget"
          className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-md border border-gray-200 bg-white py-1 shadow-lg"
        >
          {ALL_TYPES.map((type) => (
            <li key={type} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onAdd(type);
                  setOpen(false);
                }}
                className="block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
              >
                {WIDGET_META[type].title}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function DragHandleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="9" cy="6" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="15" cy="18" r="1.6" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
