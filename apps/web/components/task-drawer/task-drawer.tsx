"use client";

// Client component — a right-side drawer (sheet) for editing a single task.
// Uses ESC to close (native dialog), Server Actions for mutations, and
// optimistic updates for subtask toggles + tag attach/detach.
//
// NOTE: description editor falls back to plain <textarea>. The "rich text"
// editor referenced in the plan (Phase 0) is not yet present in the repo,
// so v1 ships with textarea — flagged in the wave report.

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { getTaskDetailAction, patchTaskAction } from "../../app/[workspace]/_actions/task-detail";
import {
  createSubtaskAction,
  toggleSubtaskAction,
  deleteSubtaskAction,
} from "../../app/[workspace]/_actions/subtasks";
import {
  attachLabelToTaskAction,
  detachLabelFromTaskAction,
  listLabelsAction,
} from "../../app/[workspace]/_actions/labels";
import {
  createTaskLinkAction,
  deleteTaskLinkAction,
} from "../../app/[workspace]/_actions/links";

type Detail = Extract<Awaited<ReturnType<typeof getTaskDetailAction>>, { ok: true }>;
type WorkspaceLabel = { id: string; name: string; color: string };

export function TaskDrawer({
  workspaceSlug,
  projectKey,
  taskId,
  open,
  onClose,
}: {
  workspaceSlug: string;
  projectKey: string;
  taskId: string;
  open: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [allLabels, setAllLabels] = useState<WorkspaceLabel[]>([]);

  // ESC + click-outside close via native <dialog>
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      dlg.showModal();
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const [d, l] = await Promise.all([
        getTaskDetailAction({ id: taskId }),
        listLabelsAction(),
      ]);
      if (cancelled) return;
      if ("error" in d && d.error) {
        setError(d.error);
        setDetail(null);
      } else if ("ok" in d) {
        setDetail(d);
      }
      if ("ok" in l && l.ok) setAllLabels(l.labels.map((x) => ({ id: x.id, name: x.name, color: x.color })));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, taskId]);

  function close() {
    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="task-drawer-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) close();
      }}
      className="m-0 ml-auto h-full max-h-screen w-full max-w-lg p-0 backdrop:bg-black/30"
    >
      <div className="flex h-screen flex-col bg-white">
        <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <span className="font-mono text-xs text-gray-500">
            {detail?.task.key ?? "Loading…"}
          </span>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
          >
            <span aria-hidden>×</span>
          </button>
        </header>

        {error ? (
          <p role="alert" className="m-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {loading || !detail ? (
          <p className="m-4 text-sm text-gray-500">Loading…</p>
        ) : (
          <TaskDrawerBody
            workspaceSlug={workspaceSlug}
            projectKey={projectKey}
            detail={detail}
            allLabels={allLabels}
            onMutated={async () => {
              const d = await getTaskDetailAction({ id: taskId });
              if ("ok" in d) setDetail(d);
            }}
          />
        )}
      </div>
    </dialog>
  );
}

function TaskDrawerBody({
  workspaceSlug,
  projectKey,
  detail,
  allLabels,
  onMutated,
}: {
  workspaceSlug: string;
  projectKey: string;
  detail: Detail;
  allLabels: WorkspaceLabel[];
  onMutated: () => Promise<void>;
}) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      <h2 id="task-drawer-title" className="sr-only">
        Task details
      </h2>
      <TitleEditor
        workspaceSlug={workspaceSlug}
        projectKey={projectKey}
        taskId={detail.task.id}
        initial={detail.task.title}
        onMutated={onMutated}
      />
      <DescriptionEditor
        workspaceSlug={workspaceSlug}
        projectKey={projectKey}
        taskId={detail.task.id}
        initial={detail.task.description ?? ""}
        onMutated={onMutated}
      />
      <MilestonePicker
        workspaceSlug={workspaceSlug}
        projectKey={projectKey}
        taskId={detail.task.id}
        current={detail.task.milestoneId}
        options={detail.milestones}
        onMutated={onMutated}
      />
      <TagsSection
        workspaceSlug={workspaceSlug}
        taskId={detail.task.id}
        current={detail.tags}
        all={allLabels}
        onMutated={onMutated}
      />
      <SubtasksSection
        workspaceSlug={workspaceSlug}
        taskId={detail.task.id}
        items={detail.subtasks}
        onMutated={onMutated}
      />
      <LinksSection
        workspaceSlug={workspaceSlug}
        taskId={detail.task.id}
        links={detail.links}
        onMutated={onMutated}
      />
    </div>
  );
}

// --- Inline editors --------------------------------------------------------

function TitleEditor({
  workspaceSlug,
  projectKey,
  taskId,
  initial,
  onMutated,
}: {
  workspaceSlug: string;
  projectKey: string;
  taskId: string;
  initial: string;
  onMutated: () => Promise<void>;
}) {
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();

  function save() {
    if (value === initial) return;
    startTransition(async () => {
      await patchTaskAction(workspaceSlug, projectKey, { id: taskId, title: value });
      await onMutated();
    });
  }

  return (
    <div className="mb-4">
      <label htmlFor="td-title" className="sr-only">
        Title
      </label>
      <input
        id="td-title"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        disabled={pending}
        className="w-full rounded-md border border-transparent px-2 py-1.5 text-lg font-semibold hover:border-gray-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
    </div>
  );
}

function DescriptionEditor({
  workspaceSlug,
  projectKey,
  taskId,
  initial,
  onMutated,
}: {
  workspaceSlug: string;
  projectKey: string;
  taskId: string;
  initial: string;
  onMutated: () => Promise<void>;
}) {
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();

  function save() {
    if (value === initial) return;
    startTransition(async () => {
      await patchTaskAction(workspaceSlug, projectKey, {
        id: taskId,
        description: value || null,
      });
      await onMutated();
    });
  }

  return (
    <div className="mb-6">
      <label htmlFor="td-desc" className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
        Description
      </label>
      <textarea
        id="td-desc"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        rows={5}
        disabled={pending}
        placeholder="Add a description…"
        className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
    </div>
  );
}

function MilestonePicker({
  workspaceSlug,
  projectKey,
  taskId,
  current,
  options,
  onMutated,
}: {
  workspaceSlug: string;
  projectKey: string;
  taskId: string;
  current: string | null;
  options: Array<{ id: string; name: string }>;
  onMutated: () => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="mb-6">
      <label htmlFor="td-ms" className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
        Milestone
      </label>
      <select
        id="td-ms"
        value={current ?? ""}
        disabled={pending}
        onChange={(e) => {
          const value = e.target.value || null;
          startTransition(async () => {
            await patchTaskAction(workspaceSlug, projectKey, {
              id: taskId,
              milestoneId: value,
            });
            await onMutated();
          });
        }}
        className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      >
        <option value="">— none —</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}

// --- Tags ------------------------------------------------------------------

function TagsSection({
  workspaceSlug,
  taskId,
  current,
  all,
  onMutated,
}: {
  workspaceSlug: string;
  taskId: string;
  current: WorkspaceLabel[];
  all: WorkspaceLabel[];
  onMutated: () => Promise<void>;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [optimisticTags, applyOptimistic] = useOptimistic(
    current,
    (state, change: { type: "add" | "remove"; label: WorkspaceLabel }) =>
      change.type === "add"
        ? [...state, change.label]
        : state.filter((t) => t.id !== change.label.id),
  );
  const [pending, startTransition] = useTransition();

  const attached = new Set(optimisticTags.map((t) => t.id));
  const available = all.filter((l) => !attached.has(l.id));

  function attach(label: WorkspaceLabel) {
    startTransition(async () => {
      applyOptimistic({ type: "add", label });
      const fd = new FormData();
      fd.append("taskId", taskId);
      fd.append("labelId", label.id);
      await attachLabelToTaskAction(workspaceSlug, fd);
      await onMutated();
    });
  }

  function detach(label: WorkspaceLabel) {
    startTransition(async () => {
      applyOptimistic({ type: "remove", label });
      const fd = new FormData();
      fd.append("taskId", taskId);
      fd.append("labelId", label.id);
      await detachLabelFromTaskAction(workspaceSlug, fd);
      await onMutated();
    });
  }

  return (
    <div className="mb-6">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Tags</p>
      <div className="flex flex-wrap items-center gap-2">
        {optimisticTags.map((t) => (
          <span
            key={t.id}
            className="inline-flex items-center gap-1.5 rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium ring-1 ring-gray-200"
          >
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
            {t.name}
            <button
              type="button"
              onClick={() => detach(t)}
              aria-label={`Remove tag ${t.name}`}
              className="ml-1 text-gray-400 hover:text-red-600"
            >
              ×
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => setShowPicker((v) => !v)}
          disabled={pending}
          className="rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-xs text-gray-500 hover:border-gray-400 hover:text-gray-700"
          aria-expanded={showPicker}
        >
          + Add tag
        </button>
      </div>
      {showPicker ? (
        <div className="mt-2 rounded-md border border-gray-200 p-2">
          {available.length === 0 ? (
            <p className="px-2 py-1 text-xs text-gray-500">All tags attached.</p>
          ) : (
            <ul className="max-h-40 overflow-y-auto">
              {available.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => {
                      attach(l);
                      setShowPicker(false);
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-gray-50"
                  >
                    <span
                      aria-hidden
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: l.color }}
                    />
                    {l.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

// --- Subtasks --------------------------------------------------------------

function SubtasksSection({
  workspaceSlug,
  taskId,
  items,
  onMutated,
}: {
  workspaceSlug: string;
  taskId: string;
  items: Array<{ id: string; title: string; done: boolean }>;
  onMutated: () => Promise<void>;
}) {
  const [optimisticItems, apply] = useOptimistic(
    items,
    (state, change: { type: "toggle"; id: string; done: boolean }) =>
      state.map((s) => (s.id === change.id ? { ...s, done: change.done } : s)),
  );
  const [pending, startTransition] = useTransition();
  const [newTitle, setNewTitle] = useState("");

  function toggle(s: { id: string; done: boolean }) {
    startTransition(async () => {
      apply({ type: "toggle", id: s.id, done: !s.done });
      const fd = new FormData();
      fd.append("id", s.id);
      fd.append("done", String(!s.done));
      await toggleSubtaskAction(workspaceSlug, fd);
      await onMutated();
    });
  }

  function add() {
    const title = newTitle.trim();
    if (!title) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.append("taskId", taskId);
      fd.append("title", title);
      await createSubtaskAction(workspaceSlug, null, fd);
      setNewTitle("");
      await onMutated();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const fd = new FormData();
      fd.append("id", id);
      await deleteSubtaskAction(workspaceSlug, fd);
      await onMutated();
    });
  }

  const done = optimisticItems.filter((s) => s.done).length;

  return (
    <div className="mb-6">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Subtasks
        </p>
        <p className="text-xs text-gray-400">
          {done}/{optimisticItems.length}
        </p>
      </div>
      <ul className="space-y-1">
        {optimisticItems.map((s) => (
          <li key={s.id} className="flex items-center gap-2">
            <input
              id={`st-${s.id}`}
              type="checkbox"
              checked={s.done}
              onChange={() => toggle(s)}
              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            <label
              htmlFor={`st-${s.id}`}
              className={`flex-1 text-sm ${s.done ? "text-gray-400 line-through" : ""}`}
            >
              {s.title}
            </label>
            <button
              type="button"
              onClick={() => remove(s.id)}
              aria-label={`Delete subtask ${s.title}`}
              className="text-xs text-gray-400 hover:text-red-600"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <label htmlFor="st-new" className="sr-only">
          New subtask
        </label>
        <input
          id="st-new"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add a subtask…"
          maxLength={500}
          className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <button
          type="button"
          onClick={add}
          disabled={pending || !newTitle.trim()}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}

// --- Dependencies (task_links) --------------------------------------------

function LinksSection({
  workspaceSlug,
  taskId,
  links,
  onMutated,
}: {
  workspaceSlug: string;
  taskId: string;
  links: Array<{
    id: string;
    type: "blocks" | "relates" | "duplicates";
    direction: "outgoing" | "incoming";
    other: { id: string; key: string; title: string };
  }>;
  onMutated: () => Promise<void>;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [otherId, setOtherId] = useState("");
  const [type, setType] = useState<"blocks" | "relates" | "duplicates">("blocks");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    setError(null);
    if (!otherId) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.append("fromTaskId", taskId);
      fd.append("toTaskId", otherId);
      fd.append("type", type);
      const res = await createTaskLinkAction(workspaceSlug, null, fd);
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      setOtherId("");
      setShowAdd(false);
      await onMutated();
    });
  }

  function del(id: string) {
    startTransition(async () => {
      const fd = new FormData();
      fd.append("id", id);
      await deleteTaskLinkAction(workspaceSlug, fd);
      await onMutated();
    });
  }

  return (
    <div className="mb-6">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
        Dependencies
      </p>
      {links.length === 0 ? (
        <p className="text-sm text-gray-500">No links.</p>
      ) : (
        <ul className="space-y-1">
          {links.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2 text-sm">
              <span>
                <span className="text-xs font-mono text-gray-500">
                  {l.direction === "outgoing" ? "this → " : "← this"}
                </span>{" "}
                <span className="font-mono text-xs">{l.other.key}</span>{" "}
                <span>{l.other.title}</span>{" "}
                <span className="ml-1 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">
                  {l.type}
                </span>
              </span>
              <button
                type="button"
                onClick={() => del(l.id)}
                aria-label="Remove dependency"
                className="text-xs text-gray-400 hover:text-red-600"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {showAdd ? (
        <div className="mt-2 space-y-2 rounded-md border border-gray-200 p-2">
          <label className="block text-xs text-gray-500" htmlFor="dep-other">
            Other task UUID
          </label>
          <input
            id="dep-other"
            value={otherId}
            onChange={(e) => setOtherId(e.target.value)}
            placeholder="Paste task id…"
            className="block w-full rounded-md border border-gray-300 px-2 py-1.5 font-mono text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500" htmlFor="dep-type">
              Type
            </label>
            <select
              id="dep-type"
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
              className="rounded-md border border-gray-300 px-2 py-1 text-xs"
            >
              <option value="blocks">blocks</option>
              <option value="relates">relates</option>
              <option value="duplicates">duplicates</option>
            </select>
            <button
              type="button"
              onClick={add}
              disabled={pending || !otherId}
              className="rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAdd(false);
                setOtherId("");
                setError(null);
              }}
              className="text-xs text-gray-500 hover:text-gray-900"
            >
              Cancel
            </button>
          </div>
          {error ? (
            <p role="alert" className="text-xs text-red-600">
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="mt-2 text-xs text-brand-600 hover:text-brand-700"
        >
          + Add dependency
        </button>
      )}
    </div>
  );
}
