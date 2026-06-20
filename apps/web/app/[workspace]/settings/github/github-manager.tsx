"use client";

// Client component — connect a repo (single "owner/repo or URL" input) and
// manage existing connections: each shows the webhook URL (copy), the signing
// secret (masked, reveal + copy), setup instructions, and regenerate/disconnect
// actions. The secret is sensitive — it's masked by default and never logged.

import { useRef, useState, useTransition } from "react";
import {
  connectRepoAction,
  disconnectAction,
  regenerateSecretAction,
} from "./actions";

type Connection = {
  id: string;
  owner: string;
  repo: string;
  webhookSecret: string;
};

export function GithubManager({
  workspaceSlug,
  webhookUrl,
  connections,
}: {
  workspaceSlug: string;
  webhookUrl: string;
  connections: Connection[];
}) {
  return (
    <div className="space-y-6">
      <ConnectForm workspaceSlug={workspaceSlug} />

      {connections.length === 0 ? (
        <p className="rounded-md border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          No repositories connected yet. Add one above.
        </p>
      ) : (
        <ul className="space-y-4">
          {connections.map((c) => (
            <ConnectionCard
              key={c.id}
              workspaceSlug={workspaceSlug}
              webhookUrl={webhookUrl}
              connection={c}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ConnectForm({ workspaceSlug }: { workspaceSlug: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await connectRepoAction(workspaceSlug, fd);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      formRef.current?.reset();
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="space-y-3 rounded-md border border-gray-200 p-4"
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-64 flex-1">
          <label htmlFor="gh-repo" className="mb-1 block text-sm font-medium text-gray-700">
            Repository
          </label>
          <input
            id="gh-repo"
            name="repo"
            type="text"
            required
            placeholder="owner/repo or https://github.com/owner/repo"
            className="block w-full rounded-md border border-gray-300 px-3 py-1.5 font-mono text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "Connecting…" : "Connect repo"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function ConnectionCard({
  workspaceSlug,
  webhookUrl,
  connection,
}: {
  workspaceSlug: string;
  webhookUrl: string;
  connection: Connection;
}) {
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function regenerate() {
    if (
      !confirm(
        "Regenerate the signing secret? You'll need to update the webhook in GitHub with the new value.",
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("id", connection.id);
      const res = await regenerateSecretAction(workspaceSlug, fd);
      if ("error" in res) setError(res.error);
      else setRevealed(true);
    });
  }

  function disconnect() {
    if (!confirm(`Disconnect ${connection.owner}/${connection.repo}?`)) return;
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("id", connection.id);
      const res = await disconnectAction(workspaceSlug, fd);
      if ("error" in res) setError(res.error);
    });
  }

  return (
    <li
      className={`space-y-4 rounded-md border border-gray-200 p-4 ${pending ? "opacity-60" : ""}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-sm font-medium">
          {connection.owner}/{connection.repo}
        </span>
        <span className="flex items-center gap-3 text-xs">
          <button
            type="button"
            onClick={regenerate}
            disabled={pending}
            className="text-gray-500 hover:text-gray-900 disabled:opacity-50"
          >
            Regenerate secret
          </button>
          <button
            type="button"
            onClick={disconnect}
            disabled={pending}
            className="text-gray-400 hover:text-red-600 disabled:opacity-50"
          >
            Disconnect
          </button>
        </span>
      </div>

      <Field label="Payload URL" value={webhookUrl} />

      <Field
        label="Secret"
        value={connection.webhookSecret}
        masked={!revealed}
        onToggleReveal={() => setRevealed((v) => !v)}
        revealed={revealed}
      />

      <div className="rounded-md bg-gray-50 p-3 text-xs text-gray-600">
        <p className="mb-1 font-medium text-gray-700">Set up in GitHub</p>
        <p>
          Repo Settings → Webhooks → Add webhook. Payload URL above, Content type{" "}
          <span className="font-mono">application/json</span>, paste the Secret, and select{" "}
          <span className="font-medium">Pull requests</span> events. Then push a branch or open a
          PR whose name includes a task key.
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </li>
  );
}

function Field({
  label,
  value,
  masked = false,
  revealed,
  onToggleReveal,
}: {
  label: string;
  value: string;
  masked?: boolean;
  revealed?: boolean;
  onToggleReveal?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const display = masked ? "•".repeat(Math.min(value.length, 40)) : value;

  async function copy() {
    // Always copy the real value, even when visually masked.
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-500">{label}</label>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={display}
          aria-label={label}
          onFocus={(e) => !masked && e.target.select()}
          className="flex-1 truncate rounded-md border border-gray-300 bg-white px-3 py-1.5 font-mono text-xs"
        />
        {onToggleReveal ? (
          <button
            type="button"
            onClick={onToggleReveal}
            className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
          >
            {revealed ? "Hide" : "Reveal"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={copy}
          className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}
