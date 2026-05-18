"use client";

// Client component — interactive CRUD over workspace labels using the
// existing _actions/labels Server Actions. Uses 8 preset colors per spec.

import { useActionState, useState, useTransition, useRef, useEffect } from "react";
import {
  createLabelAction,
  deleteLabelAction,
  updateLabelAction,
} from "../../_actions/labels";

type Label = { id: string; name: string; color: string };
type CreateState = { ok?: true; error?: string; label?: Label };

const PRESET_COLORS = [
  "#ef4444",
  "#f59e0b",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

export function LabelsManager({
  workspaceSlug,
  labels,
}: {
  workspaceSlug: string;
  labels: Label[];
}) {
  return (
    <div className="space-y-6">
      <NewLabelForm workspaceSlug={workspaceSlug} />

      {labels.length === 0 ? (
        <p className="rounded-md border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          No tags yet. Create one above.
        </p>
      ) : (
        <ul className="divide-y divide-gray-200 rounded-md border border-gray-200">
          {labels.map((l) => (
            <LabelRow key={l.id} workspaceSlug={workspaceSlug} label={l} />
          ))}
        </ul>
      )}
    </div>
  );
}

function NewLabelForm({ workspaceSlug }: { workspaceSlug: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [color, setColor] = useState(PRESET_COLORS[0]!);
  const bound = createLabelAction.bind(null, workspaceSlug);
  const [state, action, pending] = useActionState<CreateState, FormData>(bound, {});

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setColor(PRESET_COLORS[0]!);
    }
  }, [state.ok]);

  return (
    <form ref={formRef} action={action} className="space-y-3 rounded-md border border-gray-200 p-4">
      <div className="flex gap-2">
        <div className="flex-1">
          <label htmlFor="lbl-name" className="sr-only">
            Label name
          </label>
          <input
            id="lbl-name"
            name="name"
            type="text"
            required
            maxLength={60}
            placeholder="Tag name…"
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <input type="hidden" name="color" value={color} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add tag"}
        </button>
      </div>
      <ColorPicker value={color} onChange={setColor} />
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

function LabelRow({ workspaceSlug, label }: { workspaceSlug: string; label: Label }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(label.name);
  const [color, setColor] = useState(label.color);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("id", label.id);
      fd.append("name", name);
      fd.append("color", color);
      const res = await updateLabelAction(workspaceSlug, fd);
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      setEditing(false);
    });
  }

  function onDelete() {
    if (!confirm(`Delete tag "${label.name}"?`)) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.append("id", label.id);
      await deleteLabelAction(workspaceSlug, fd);
    });
  }

  return (
    <li className={`px-4 py-3 ${pending ? "opacity-60" : ""}`}>
      {editing ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              aria-label="Tag name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setName(label.name);
                setColor(label.color);
              }}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
          <ColorPicker value={color} onChange={setColor} />
          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2">
            <span
              aria-hidden
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: label.color }}
            />
            <span className="text-sm font-medium">{label.name}</span>
          </span>
          <span className="flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-gray-500 hover:text-gray-900"
            >
              Rename
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="text-gray-400 hover:text-red-600"
            >
              Delete
            </button>
          </span>
        </div>
      )}
    </li>
  );
}

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Tag color" className="flex flex-wrap gap-2">
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={`Color ${c}`}
          onClick={() => onChange(c)}
          className={`h-6 w-6 rounded-full ring-2 ring-offset-1 transition ${
            value === c ? "ring-gray-700" : "ring-transparent hover:ring-gray-300"
          }`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}
