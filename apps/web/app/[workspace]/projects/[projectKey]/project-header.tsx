"use client";

// Client component — renders the project header with launch chip + tags
// and opens an "Edit dates" dialog. The chips themselves are presentational;
// editing target_date posts to the existing updateProjectMeta server action.

import { useActionState, useEffect, useRef } from "react";
import { updateProjectMeta } from "./actions";

type LaunchStatus = "on-track" | "at-risk" | "slipped" | "none";

const STATUS_COLORS: Record<LaunchStatus, string> = {
  "on-track": "bg-green-100 text-green-800",
  "at-risk": "bg-amber-100 text-amber-800",
  slipped: "bg-red-100 text-red-800",
  none: "bg-gray-100 text-gray-700",
};

const STATUS_LABELS: Record<LaunchStatus, string> = {
  "on-track": "On track",
  "at-risk": "At risk",
  slipped: "Slipped",
  none: "No launch date",
};

type State = { ok?: true; error?: string };

export function ProjectHeader({
  workspaceSlug,
  projectKey,
  project,
  tags,
  launchStatus,
}: {
  workspaceSlug: string;
  projectKey: string;
  project: {
    id: string;
    key: string;
    name: string;
    targetDate: string | null;
    startDate: string | null;
  };
  tags: Array<{ id: string; name: string; color: string }>;
  launchStatus: LaunchStatus;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const bound = updateProjectMeta.bind(null, workspaceSlug, projectKey);
  const [state, action, pending] = useActionState<State, FormData>(bound, {});

  useEffect(() => {
    if (state.ok) dialogRef.current?.close();
  }, [state.ok]);

  return (
    <header className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-gray-500">{project.key}</p>
          <h1 className="text-xl font-semibold tracking-tight">{project.name}</h1>
        </div>
        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Edit project
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span
          aria-label={`Launch status: ${STATUS_LABELS[launchStatus]}`}
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[launchStatus]}`}
        >
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
          {project.targetDate ? (
            <>
              Launch {project.targetDate}
              <span className="ml-1 opacity-70">· {STATUS_LABELS[launchStatus]}</span>
            </>
          ) : (
            STATUS_LABELS[launchStatus]
          )}
        </span>

        {tags.map((t) => (
          <span
            key={t.id}
            className="inline-flex items-center gap-1.5 rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700 ring-1 ring-gray-200"
          >
            <span
              aria-hidden
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: t.color }}
            />
            {t.name}
          </span>
        ))}
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby="edit-project-title"
        className="w-full max-w-md rounded-lg p-0 backdrop:bg-black/30"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current.close();
        }}
      >
        <form action={action} className="space-y-4 p-6">
          <h2 id="edit-project-title" className="text-base font-semibold">
            Edit project
          </h2>
          <input type="hidden" name="id" value={project.id} />
          <div>
            <label htmlFor="ep-start" className="block text-sm font-medium text-gray-700">
              Start date
            </label>
            <input
              id="ep-start"
              name="startDate"
              type="date"
              defaultValue={project.startDate ?? ""}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label htmlFor="ep-target" className="block text-sm font-medium text-gray-700">
              Launch / target date
            </label>
            <input
              id="ep-target"
              name="targetDate"
              type="date"
              defaultValue={project.targetDate ?? ""}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          {state.error ? (
            <p role="alert" className="text-sm text-red-600">
              {state.error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </dialog>
    </header>
  );
}
