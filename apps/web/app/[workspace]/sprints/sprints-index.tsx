"use client";

// Client component — the "New sprint" form lives in a native <dialog>. Needs
// interactivity (open/close, reset on success, useActionState pending state),
// so it can't be a Server Component.

import { useActionState, useEffect, useRef } from "react";
import { createSprintAction } from "./actions";

type State = { ok?: true; sprintId?: string; error?: string };

export interface ProjectOption {
  id: string;
  key: string;
  name: string;
}

export function NewSprintButton({
  workspaceSlug,
  projects,
}: {
  workspaceSlug: string;
  projects: ProjectOption[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const boundAction = createSprintAction.bind(null, workspaceSlug);
  const [state, action, pending] = useActionState<State, FormData>(boundAction, {});

  useEffect(() => {
    if (state.ok && dialogRef.current?.open) {
      dialogRef.current.close();
      formRef.current?.reset();
    }
  }, [state.ok]);

  const noProjects = projects.length === 0;

  function open() {
    dialogRef.current?.showModal();
  }
  function close() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        disabled={noProjects}
        title={noProjects ? "Create a project first" : undefined}
        className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        New sprint
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="new-sprint-title"
        className="w-full max-w-md rounded-lg p-0 backdrop:bg-black/30"
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
      >
        <form ref={formRef} action={action} className="space-y-4 p-6">
          <h2 id="new-sprint-title" className="text-base font-semibold">
            New sprint
          </h2>

          <div>
            <label htmlFor="sprint-project" className="block text-sm font-medium text-gray-700">
              Project
            </label>
            <select
              id="sprint-project"
              name="projectId"
              required
              defaultValue={projects[0]?.id ?? ""}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.key})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="sprint-name" className="block text-sm font-medium text-gray-700">
              Name
            </label>
            <input
              id="sprint-name"
              name="name"
              type="text"
              required
              minLength={1}
              maxLength={200}
              autoFocus
              placeholder="Sprint 1"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label htmlFor="sprint-goal" className="block text-sm font-medium text-gray-700">
              Goal <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <textarea
              id="sprint-goal"
              name="goal"
              rows={2}
              maxLength={2000}
              placeholder="What should this sprint deliver?"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="sprint-start" className="block text-sm font-medium text-gray-700">
                Start
              </label>
              <input
                id="sprint-start"
                name="startAt"
                type="date"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label htmlFor="sprint-end" className="block text-sm font-medium text-gray-700">
                End
              </label>
              <input
                id="sprint-end"
                name="endAt"
                type="date"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>

          {state.error ? (
            <p role="alert" className="text-sm text-red-600">
              {state.error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {pending ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
