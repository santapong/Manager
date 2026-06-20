"use client";

// Lifecycle controls for a sprint (Start / Finish / Delete). Client so each
// button surfaces a pending state and inline errors via useActionState; the
// bound Server Actions revalidate and (for delete) the page redirects on the
// server side via the sprints list link the user lands back on.

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { deleteSprintAction, finishSprintAction, startSprintAction } from "../actions";

type State = { ok?: true; error?: string };

export function StartSprintButton({ workspaceSlug, sprintId }: { workspaceSlug: string; sprintId: string }) {
  const [state, action, pending] = useActionState<State, FormData>(
    startSprintAction.bind(null, workspaceSlug),
    {},
  );
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={sprintId} />
      {state.error ? (
        <span role="alert" className="text-xs text-red-600">
          {state.error}
        </span>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {pending ? "Starting…" : "Start sprint"}
      </button>
    </form>
  );
}

export function FinishSprintButton({ workspaceSlug, sprintId }: { workspaceSlug: string; sprintId: string }) {
  const [state, action, pending] = useActionState<State, FormData>(
    finishSprintAction.bind(null, workspaceSlug),
    {},
  );
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={sprintId} />
      {state.error ? (
        <span role="alert" className="text-xs text-red-600">
          {state.error}
        </span>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        {pending ? "Finishing…" : "Finish sprint"}
      </button>
    </form>
  );
}

export function DeleteSprintButton({ workspaceSlug, sprintId }: { workspaceSlug: string; sprintId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<State, FormData>(
    deleteSprintAction.bind(null, workspaceSlug),
    {},
  );

  // On success the sprint is gone — send the user back to the list.
  useEffect(() => {
    if (state.ok) router.push(`/${workspaceSlug}/sprints`);
  }, [state.ok, router, workspaceSlug]);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Delete this sprint? Its tasks return to the backlog.")) e.preventDefault();
      }}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="id" value={sprintId} />
      {state.error ? (
        <span role="alert" className="text-xs text-red-600">
          {state.error}
        </span>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
    </form>
  );
}
