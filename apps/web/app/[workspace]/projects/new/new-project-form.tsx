"use client";

import { useActionState } from "react";
import { createProject } from "./actions";

type State = { error?: string };

export function NewProjectForm() {
  const [state, action, pending] = useActionState<State, FormData>(createProject, {});
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700">
          Project name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          minLength={2}
          maxLength={60}
          placeholder="Engineering"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>
      <div>
        <label htmlFor="key" className="block text-sm font-medium text-gray-700">
          Key
        </label>
        <input
          id="key"
          name="key"
          type="text"
          required
          minLength={2}
          maxLength={10}
          pattern="[A-Za-z][A-Za-z0-9]+"
          placeholder="ENG"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono uppercase focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="block w-full rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create project"}
      </button>
    </form>
  );
}
