"use client";

// Streaming chat UI (Wave 2b reads, Wave 2c gated writes). The /api/ai/chat
// endpoint now streams newline-delimited JSON (NDJSON) instead of plain text;
// each line is one of:
//   { type: "text",     text }     a model text delta → grows the live bubble
//   { type: "proposal", proposal } a gated write → renders a Confirm/Dismiss card
//   { type: "error",    message }  a terminal error → shown inline
// We read the body reader, buffer partial lines, split on "\n", JSON.parse each
// complete line, append text to the in-progress assistant bubble, and collect
// proposals onto that same message. The whole prior transcript is replayed to
// the (stateless) server on each send.
//
// A proposal NEVER mutates on its own: Confirm calls `applyProposalAction`,
// which runs the real RLS-scoped Server Action. Applying a proposal is
// independent of the model loop — it does not re-call the assistant.

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { type AssistantProposal } from "@/src/lib/validators/ai";
import { applyProposalAction } from "./actions";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** Gated writes proposed during this assistant turn. */
  proposals?: AssistantProposal[];
}

/** Per-proposal interaction state, keyed by proposal id (separate from the
 * streaming reducer so growing the transcript never disturbs it). */
type ProposalState =
  | { status: "pending" }
  | { status: "applying" }
  | { status: "applied"; taskKey: string }
  | { status: "failed"; error: string }
  | { status: "dismissed" };

type StreamEvent =
  | { type: "text"; text: string }
  | { type: "proposal"; proposal: AssistantProposal }
  | { type: "error"; message: string };

export function AssistantChat({ slug }: { slug: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposalState, setProposalState] = useState<Record<string, ProposalState>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the latest message in view as text streams in.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streaming]);

  // Apply one NDJSON event to local state. Text grows the last assistant bubble;
  // proposals are appended to it and registered as pending.
  const applyEvent = useCallback((evt: StreamEvent) => {
    if (evt.type === "error") {
      setError(evt.message);
      return;
    }
    setMessages((prev) => {
      const copy = prev.slice();
      const last = copy[copy.length - 1];
      if (!last || last.role !== "assistant") return prev;
      if (evt.type === "text") {
        copy[copy.length - 1] = { ...last, content: last.content + evt.text };
      } else {
        copy[copy.length - 1] = {
          ...last,
          proposals: [...(last.proposals ?? []), evt.proposal],
        };
      }
      return copy;
    });
    if (evt.type === "proposal") {
      setProposalState((s) => ({ ...s, [evt.proposal.id]: { status: "pending" } }));
    }
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    setError(null);
    setInput("");

    // The transcript we send is everything so far PLUS the new user turn.
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    // Render the user turn and an empty assistant bubble we'll fill as events arrive.
    setMessages([...next, { role: "assistant", content: "" }]);
    setStreaming(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Only role+content cross the wire; proposals are client-local.
        body: JSON.stringify({ messages: next.map((m) => ({ role: m.role, content: m.content })) }),
      });

      if (!res.ok || !res.body) {
        let message = "The assistant is unavailable right now.";
        try {
          const data = (await res.json()) as { error?: string };
          if (data.error) message = data.error;
        } catch {
          // non-JSON error body — keep the default message
        }
        // Drop the empty assistant bubble; show the error separately.
        setMessages(next);
        setError(message);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      // Parse a complete NDJSON line; ignore anything malformed.
      const handleLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        let evt: StreamEvent;
        try {
          evt = JSON.parse(trimmed) as StreamEvent;
        } catch {
          return;
        }
        applyEvent(evt);
      };

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl = buffer.indexOf("\n");
        while (nl !== -1) {
          handleLine(buffer.slice(0, nl));
          buffer = buffer.slice(nl + 1);
          nl = buffer.indexOf("\n");
        }
      }
      // Flush any trailing partial line (stream may end without a newline).
      buffer += decoder.decode();
      if (buffer) handleLine(buffer);
    } catch {
      setMessages(next);
      setError("The connection was interrupted. Please try again.");
    } finally {
      setStreaming(false);
    }
  }, [input, messages, streaming, applyEvent]);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter inserts a newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div
      data-workspace={slug}
      className="flex min-h-0 flex-1 flex-col rounded-md border border-gray-200 bg-white"
    >
      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto p-4"
        aria-label="Conversation"
      >
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">
            Ask something like &ldquo;What&apos;s in the current sprint?&rdquo; or &ldquo;Create a
            bug in ENG: login fails on Safari.&rdquo;
          </p>
        ) : (
          messages.map((m, i) => (
            <Bubble
              key={i}
              message={m}
              streaming={streaming}
              last={i === messages.length - 1}
              slug={slug}
              proposalState={proposalState}
              setProposalState={setProposalState}
            />
          ))
        )}
        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}
      </div>

      <form
        className="flex items-end gap-2 border-t border-gray-200 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label htmlFor="assistant-input" className="sr-only">
          Message the assistant
        </label>
        <textarea
          id="assistant-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          disabled={streaming}
          placeholder="Ask about your projects, or ask me to create or update a task…"
          className="block flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50"
        />
        <button
          type="submit"
          disabled={streaming || input.trim().length === 0}
          className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {streaming ? "Sending…" : "Send"}
        </button>
      </form>
    </div>
  );
}

function Bubble({
  message,
  streaming,
  last,
  slug,
  proposalState,
  setProposalState,
}: {
  message: ChatMessage;
  streaming: boolean;
  last: boolean;
  slug: string;
  proposalState: Record<string, ProposalState>;
  setProposalState: React.Dispatch<React.SetStateAction<Record<string, ProposalState>>>;
}) {
  const isUser = message.role === "user";
  // The streaming assistant bubble is a live region so screen readers announce
  // incoming text; a thinking hint shows while it's still empty.
  const isStreamingAssistant = !isUser && last && streaming;
  const showThinking =
    isStreamingAssistant && !message.content && (message.proposals?.length ?? 0) === 0;
  return (
    <div className={isUser ? "flex justify-end" : "flex flex-col items-start gap-2"}>
      <div
        aria-live={isStreamingAssistant ? "polite" : undefined}
        className={
          isUser
            ? "max-w-[80%] self-end whitespace-pre-wrap rounded-lg bg-brand-600 px-3 py-2 text-sm text-white"
            : "max-w-[80%] whitespace-pre-wrap rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-900"
        }
      >
        {message.content || (showThinking ? <span className="text-gray-400">Thinking…</span> : null)}
      </div>
      {!isUser && message.proposals?.length
        ? message.proposals.map((p) => (
            <ProposalCard
              key={p.id}
              proposal={p}
              slug={slug}
              state={proposalState[p.id] ?? { status: "pending" }}
              setProposalState={setProposalState}
            />
          ))
        : null}
    </div>
  );
}

function ProposalCard({
  proposal,
  slug,
  state,
  setProposalState,
}: {
  proposal: AssistantProposal;
  slug: string;
  state: ProposalState;
  setProposalState: React.Dispatch<React.SetStateAction<Record<string, ProposalState>>>;
}) {
  const [pending, startTransition] = useTransition();
  const done = state.status === "applied" || state.status === "dismissed";
  const busy = pending || state.status === "applying";

  const confirm = useCallback(() => {
    setProposalState((s) => ({ ...s, [proposal.id]: { status: "applying" } }));
    startTransition(async () => {
      const result = await applyProposalAction(slug, JSON.stringify(proposal));
      setProposalState((s) => ({
        ...s,
        [proposal.id]:
          "ok" in result
            ? { status: "applied", taskKey: result.taskKey }
            : { status: "failed", error: result.error },
      }));
    });
  }, [proposal, slug, setProposalState]);

  const dismiss = useCallback(() => {
    setProposalState((s) => ({ ...s, [proposal.id]: { status: "dismissed" } }));
  }, [proposal.id, setProposalState]);

  return (
    <div className="max-w-[80%] rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
      <p className="font-medium text-amber-900">Proposed change</p>
      <p className="mt-0.5 text-amber-800">{proposal.summary}</p>

      {state.status === "applied" ? (
        <p role="status" className="mt-2 text-green-700">
          Applied — {state.taskKey}.
        </p>
      ) : state.status === "dismissed" ? (
        <p role="status" className="mt-2 text-gray-500">
          Dismissed.
        </p>
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={confirm}
            disabled={busy || done}
            aria-label={`Confirm: ${proposal.summary}`}
            className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {busy ? "Applying…" : "Confirm"}
          </button>
          <button
            type="button"
            onClick={dismiss}
            disabled={busy || done}
            aria-label={`Dismiss: ${proposal.summary}`}
            className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
          >
            Dismiss
          </button>
          {state.status === "failed" ? (
            <span role="status" className="text-red-600">
              {state.error}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
