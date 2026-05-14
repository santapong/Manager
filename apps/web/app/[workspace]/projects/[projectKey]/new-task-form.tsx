"use client";

import { useActionState, useRef, useEffect } from "react";
import { createTask } from "./actions";

type State = { ok?: boolean; error?: string };

export function NewTaskForm({ workspaceSlug, projectKey }: { workspaceSlug: string; projectKey: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const boundAction = createTask.bind(null, workspaceSlug, projectKey);
  const [state, action, pending] = useActionState<State, FormData>(boundAction, {});

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={action} className="flex gap-2">
      <input
        name="title"
        type="text"
        required
        minLength={1}
        maxLength={200}
        placeholder="Add a task and hit Enter"
        className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add"}
      </button>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
