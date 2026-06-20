"use client";

// Client component -- the editor is interactive: local title/body state, dirty
// tracking, a live Markdown preview, and save/delete via Server Actions.

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Markdown } from "@/src/lib/markdown";
import { deleteDocumentAction, updateDocumentAction } from "../actions";

type Doc = { id: string; title: string; body: string };
type SaveStatus = "idle" | "saved" | "error";

export function DocEditor({
  workspaceSlug,
  doc,
}: {
  workspaceSlug: string;
  doc: Doc;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(doc.title);
  const [body, setBody] = useState(doc.body);
  const [savedTitle, setSavedTitle] = useState(doc.title);
  const [savedBody, setSavedBody] = useState(doc.body);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [deleting, startDelete] = useTransition();

  const dirty = title !== savedTitle || body !== savedBody;
  const titleEmpty = title.trim() === "";

  function save() {
    if (!dirty || titleEmpty) return;
    setError(null);
    setStatus("idle");
    startSave(async () => {
      const fd = new FormData();
      fd.append("id", doc.id);
      fd.append("title", title.trim());
      fd.append("body", body);
      const res = await updateDocumentAction(workspaceSlug, fd);
      if ("error" in res && res.error) {
        setError(res.error);
        setStatus("error");
        return;
      }
      setSavedTitle(title.trim());
      setSavedBody(body);
      setTitle(title.trim());
      setStatus("saved");
    });
  }

  function onDelete() {
    if (!confirm(`Delete "${savedTitle}"? This cannot be undone.`)) return;
    startDelete(async () => {
      const fd = new FormData();
      fd.append("id", doc.id);
      const res = await deleteDocumentAction(workspaceSlug, fd);
      if ("error" in res && res.error) {
        setError(res.error);
        setStatus("error");
        return;
      }
      router.push(`/${workspaceSlug}/docs`);
    });
  }

  const busy = saving || deleting;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <Link
          href={`/${workspaceSlug}/docs`}
          className="text-sm text-gray-500 hover:text-gray-900"
        >
          ← All docs
        </Link>
        <div className="flex items-center gap-3">
          {status === "saved" && !dirty ? (
            <span className="text-xs text-green-600" role="status">
              Saved
            </span>
          ) : null}
          {dirty ? (
            <span className="text-xs text-gray-400" role="status">
              Unsaved changes
            </span>
          ) : null}
          <button
            type="button"
            onClick={save}
            disabled={!dirty || titleEmpty || busy}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-red-600 disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>

      <div>
        <label htmlFor="doc-title" className="sr-only">
          Document title
        </label>
        <input
          id="doc-title"
          type="text"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setStatus("idle");
          }}
          maxLength={200}
          placeholder="Untitled document"
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-lg font-semibold focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        {titleEmpty ? (
          <p className="mt-1 text-xs text-red-600">Title is required to save.</p>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col">
          <label
            htmlFor="doc-body"
            className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500"
          >
            Markdown
          </label>
          <textarea
            id="doc-body"
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setStatus("idle");
            }}
            spellCheck
            placeholder="# Start writing…"
            className="min-h-[24rem] w-full flex-1 resize-y rounded-md border border-gray-300 p-3 font-mono text-sm leading-relaxed focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div className="flex flex-col">
          <span className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
            Preview
          </span>
          <div
            aria-label="Markdown preview"
            className="min-h-[24rem] flex-1 overflow-auto rounded-md border border-gray-200 bg-white p-4"
          >
            {body.trim() === "" ? (
              <p className="text-sm text-gray-400">Nothing to preview yet.</p>
            ) : (
              <Markdown source={body} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
