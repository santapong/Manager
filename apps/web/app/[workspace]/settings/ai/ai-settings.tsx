"use client";

// Client UI for AI key management + a "Try it" demo. The key is write-only:
// we render the placeholder and `last4` but never the key itself (the server
// never sends it). Writes are owner/admin-only — non-admins get a read-only
// notice. All mutations go through Server Actions via useTransition.

import { useRef, useState, useTransition } from "react";
import { removeKeyAction, setKeyAction, summarizeAction } from "./actions";

type Role = "owner" | "admin" | "member" | "guest";

export function AiSettings({
  slug,
  hasKey,
  last4,
  encryptionConfigured,
  role,
}: {
  slug: string;
  hasKey: boolean;
  last4: string | null;
  encryptionConfigured: boolean;
  role: Role;
}) {
  const canManage = role === "owner" || role === "admin";

  if (!encryptionConfigured) {
    return (
      <div
        role="status"
        className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
      >
        <p className="font-medium">AI is not configured on this server.</p>
        <p className="mt-1">
          A platform admin must set the <span className="font-mono">AI_ENCRYPTION_KEY</span>{" "}
          environment variable before workspace API keys can be stored.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Anthropic API key</h2>
        {canManage ? (
          <KeyManager slug={slug} hasKey={hasKey} last4={last4} />
        ) : (
          <ReadOnlyKeyState hasKey={hasKey} last4={last4} />
        )}
      </section>

      {hasKey ? <TryItBox slug={slug} /> : null}
    </div>
  );
}

function KeyManager({
  slug,
  hasKey,
  last4,
}: {
  slug: string;
  hasKey: boolean;
  last4: string | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(!hasKey);

  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await setKeyAction(slug, fd);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      formRef.current?.reset();
      setEditing(false);
    });
  }

  function remove() {
    if (!confirm("Remove the AI key for this workspace? The assistant will stop working.")) return;
    setError(null);
    startTransition(async () => {
      const res = await removeKeyAction(slug, new FormData());
      if ("error" in res) setError(res.error);
    });
  }

  if (hasKey && !editing) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-gray-200 p-4">
          <span className="inline-flex items-center gap-2 text-sm font-medium text-green-700">
            <span aria-hidden>Set</span>
            <span aria-hidden>&#10003;</span>
          </span>
          <span className="font-mono text-sm text-gray-600" aria-label="key ending">
            &middot;&middot;&middot;&middot;{last4}
          </span>
          <span className="ml-auto flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={pending}
              className="text-gray-500 hover:text-gray-900 disabled:opacity-50"
            >
              Rotate
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="text-gray-400 hover:text-red-600 disabled:opacity-50"
            >
              Remove
            </button>
          </span>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={save} className="space-y-3 rounded-md border border-gray-200 p-4">
      <div>
        <label htmlFor="ai-key" className="mb-1 block text-sm font-medium text-gray-700">
          {hasKey ? "New API key" : "API key"}
        </label>
        <input
          id="ai-key"
          name="apiKey"
          type="password"
          required
          autoComplete="off"
          spellCheck={false}
          placeholder="sk-ant-…"
          className="block w-full rounded-md border border-gray-300 px-3 py-1.5 font-mono text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <p className="mt-1 text-xs text-gray-500">
          Stored encrypted. We verify it with Anthropic before saving and never display it again.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save key"}
        </button>
        {hasKey ? (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setEditing(false);
            }}
            disabled={pending}
            className="text-sm text-gray-500 hover:text-gray-900 disabled:opacity-50"
          >
            Cancel
          </button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function ReadOnlyKeyState({ hasKey, last4 }: { hasKey: boolean; last4: string | null }) {
  return (
    <div className="rounded-md border border-gray-200 p-4 text-sm text-gray-600">
      {hasKey ? (
        <p>
          A key is set (<span className="font-mono">&middot;&middot;&middot;&middot;{last4}</span>).
          Ask an owner or admin to rotate or remove it.
        </p>
      ) : (
        <p>No AI key is set for this workspace. Ask an owner or admin to add one.</p>
      )}
    </div>
  );
}

function TryItBox({ slug }: { slug: string }) {
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSummary(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await summarizeAction(slug, fd);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setSummary(res.text);
    });
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-gray-900">Try it</h2>
      <form onSubmit={run} className="space-y-3 rounded-md border border-gray-200 p-4">
        <label htmlFor="ai-try" className="block text-sm font-medium text-gray-700">
          Paste some text to summarize
        </label>
        <textarea
          id="ai-try"
          name="text"
          rows={5}
          required
          placeholder="Paste meeting notes, a long task description, or a thread…"
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "Summarizing…" : "Summarize"}
        </button>
        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}
        {summary ? (
          <div className="rounded-md bg-gray-50 p-3 text-sm text-gray-800">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Summary</p>
            <p className="whitespace-pre-wrap">{summary}</p>
          </div>
        ) : null}
      </form>
    </section>
  );
}
