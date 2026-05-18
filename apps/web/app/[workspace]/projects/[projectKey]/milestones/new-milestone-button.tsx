"use client";

// Client component — wraps the native <dialog> for a modal "New milestone" form.
// Uses useActionState bound to the existing createMilestoneAction.

import { useActionState, useEffect, useRef } from "react";
import { createMilestoneAction } from "../../../_actions/milestones";

type State = { ok?: true; error?: string };

export function NewMilestoneButton({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const boundAction = createMilestoneAction.bind(null, workspaceSlug);
  const [state, action, pending] = useActionState<State, FormData>(boundAction, {});

  useEffect(() => {
    if (state.ok && dialogRef.current?.open) {
      dialogRef.current.close();
      formRef.current?.reset();
    }
  }, [state.ok]);

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
        className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
      >
        New milestone
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="new-ms-title"
        className="w-full max-w-md rounded-lg p-0 backdrop:bg-black/30"
        onClick={(e) => {
          // click outside the form closes the dialog
          if (e.target === dialogRef.current) close();
        }}
      >
        <form ref={formRef} action={action} className="space-y-4 p-6">
          <h2 id="new-ms-title" className="text-base font-semibold">
            New milestone
          </h2>

          <input type="hidden" name="projectId" value={projectId} />

          <div>
            <label htmlFor="ms-name" className="block text-sm font-medium text-gray-700">
              Name
            </label>
            <input
              id="ms-name"
              name="name"
              type="text"
              required
              minLength={1}
              maxLength={200}
              autoFocus
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label htmlFor="ms-target" className="block text-sm font-medium text-gray-700">
              Target date
            </label>
            <input
              id="ms-target"
              name="targetDate"
              type="date"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label htmlFor="ms-desc" className="block text-sm font-medium text-gray-700">
              Description
            </label>
            <textarea
              id="ms-desc"
              name="description"
              rows={3}
              maxLength={10000}
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
