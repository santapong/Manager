"use client";

// Comment thread + composer with @mention autocomplete. The composer
// inserts canonical @[Display Name](uuid) tokens; the server resolves
// them to workspace members and fans out notifications (queries/comments).

import { Fragment, useRef, useState, useTransition } from "react";
import { createCommentAction, deleteCommentAction } from "../../app/[workspace]/_actions/comments";

type Member = { userId: string; name: string | null; email: string };
type CommentItem = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string } | null;
};

const TOKEN_SPLIT = /(@\[[^\]]*\]\([0-9a-f-]{36}\))/giu;
const TOKEN_PARSE = /^@\[([^\]]*)\]\([0-9a-f-]{36}\)$/iu;

/** Render a body, turning mention tokens into highlighted chips. */
function CommentBody({ body }: { body: string }) {
  const parts = body.split(TOKEN_SPLIT);
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed">
      {parts.map((part, i) => {
        const m = part.match(TOKEN_PARSE);
        return m ? (
          <span
            key={i}
            className="rounded bg-brand-50 px-1 py-0.5 text-xs font-medium text-brand-700"
          >
            @{m[1]}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        );
      })}
    </p>
  );
}

export function CommentsSection({
  workspaceSlug,
  projectKey,
  taskId,
  comments,
  members,
  me,
  onMutated,
}: {
  workspaceSlug: string;
  projectKey: string;
  taskId: string;
  comments: CommentItem[];
  members: Member[];
  me: { id: string; role: "owner" | "admin" | "member" | "guest" };
  onMutated: () => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");

  function submit() {
    const trimmed = body.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      const res = await createCommentAction(workspaceSlug, projectKey, { taskId, body: trimmed });
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      setBody("");
      await onMutated();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await deleteCommentAction(workspaceSlug, projectKey, { id });
      await onMutated();
    });
  }

  const canModerate = me.role === "owner" || me.role === "admin";

  return (
    <div className="mb-6">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
        Comments {comments.length > 0 ? `(${comments.length})` : ""}
      </p>

      {comments.length > 0 ? (
        <ul className="mb-3 space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="rounded-md border border-gray-200 p-2.5">
              <div className="mb-1 flex items-center gap-2 text-xs text-gray-500">
                <span className="font-medium text-gray-700">{c.author?.name ?? "(deleted)"}</span>
                <span>{c.createdAt.slice(0, 16).replace("T", " ")}</span>
                {c.author?.id === me.id || canModerate ? (
                  <button
                    type="button"
                    onClick={() => remove(c.id)}
                    aria-label="Delete comment"
                    className="ml-auto text-gray-400 hover:text-red-600"
                  >
                    ×
                  </button>
                ) : null}
              </div>
              <CommentBody body={c.body} />
            </li>
          ))}
        </ul>
      ) : null}

      <MentionTextarea value={body} onChange={setBody} members={members} onSubmit={submit} />
      {error ? (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      ) : null}
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={pending || !body.trim()}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "Posting…" : "Comment"}
        </button>
      </div>
    </div>
  );
}

// --- Mention autocomplete ----------------------------------------------------

const TRIGGER = /@([\p{L}\p{N}._-]*)$/u;

function MentionTextarea({
  value,
  onChange,
  members,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  members: Member[];
  onSubmit: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);

  const matches =
    query === null
      ? []
      : members
          .filter((m) =>
            (m.name ?? m.email).toLowerCase().includes(query.toLowerCase()),
          )
          .slice(0, 6);
  const open = query !== null && matches.length > 0;

  function refreshQuery(next: string, caret: number) {
    const beforeCaret = next.slice(0, caret);
    const m = beforeCaret.match(TRIGGER);
    setQuery(m ? (m[1] ?? "") : null);
    setHighlight(0);
  }

  function pick(member: Member) {
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const beforeCaret = value.slice(0, caret).replace(TRIGGER, "");
    const token = `@[${member.name ?? member.email}](${member.userId}) `;
    const next = beforeCaret + token + value.slice(caret);
    onChange(next);
    setQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = (beforeCaret + token).length;
      el?.setSelectionRange(pos, pos);
    });
  }

  return (
    <div className="relative">
      <label htmlFor="td-comment" className="sr-only">
        Add a comment
      </label>
      <textarea
        id="td-comment"
        ref={ref}
        value={value}
        rows={3}
        placeholder="Add a comment… use @ to mention"
        onChange={(e) => {
          onChange(e.target.value);
          refreshQuery(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={(e) => {
          if (open) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => (h + 1) % matches.length);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => (h - 1 + matches.length) % matches.length);
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              pick(matches[highlight]!);
              return;
            }
            if (e.key === "Escape") {
              setQuery(null);
              return;
            }
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSubmit();
          }
        }}
        className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      {open ? (
        <ul
          role="listbox"
          aria-label="Mention a member"
          className="absolute bottom-full left-0 z-10 mb-1 w-64 rounded-md border border-gray-200 bg-white py-1 shadow-lg"
        >
          {matches.map((m, i) => (
            <li key={m.userId} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(m);
                }}
                className={`block w-full px-3 py-1.5 text-left text-sm ${
                  i === highlight ? "bg-brand-50 text-brand-700" : "hover:bg-gray-50"
                }`}
              >
                {m.name ?? m.email}
                {m.name ? <span className="ml-2 text-xs text-gray-400">{m.email}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
