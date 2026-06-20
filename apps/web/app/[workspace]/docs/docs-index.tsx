"use client";

// Client component -- needs local state for the inline "New document" title
// input and to push the router into the freshly created doc.

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createDocumentAction } from "./actions";

export function NewDocumentForm({ workspaceSlug }: { workspaceSlug: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const title = inputRef.current?.value.trim() ?? "";
    if (title === "") {
      setError("Title is required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("title", title);
      const res = await createDocumentAction(workspaceSlug, fd);
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      if ("id" in res && res.id) {
        router.push(`/${workspaceSlug}/docs/${res.id}`);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <label htmlFor="new-doc-title" className="sr-only">
          New document title
        </label>
        <input
          id="new-doc-title"
          ref={inputRef}
          type="text"
          required
          maxLength={200}
          placeholder="New document title…"
          disabled={pending}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "Creating…" : "New document"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </form>
  );
}
