"use client";

// Streaming chat UI (Wave 2b). Plain text/plain stream from /api/ai/chat:
// we append the user's message, open a fetch, read the response body reader,
// decode chunks, and grow the in-progress assistant bubble token-by-token.
// Tool calls happen server-side and are invisible here — they just show up as
// a pause before more text streams in. Input is disabled while streaming;
// non-OK responses surface the JSON error inline. The whole prior transcript
// is replayed to the server on each send (the endpoint is stateless).

import { useCallback, useEffect, useRef, useState } from "react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function AssistantChat({ slug }: { slug: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the latest message in view as text streams in.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streaming]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    setError(null);
    setInput("");

    // The transcript we send is everything so far PLUS the new user turn.
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    // Render the user turn and an empty assistant bubble we'll fill as tokens arrive.
    setMessages([...next, { role: "assistant", content: "" }]);
    setStreaming(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next }),
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
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;
        setMessages((prev) => {
          const copy = prev.slice();
          const last = copy[copy.length - 1];
          if (last && last.role === "assistant") {
            copy[copy.length - 1] = { role: "assistant", content: last.content + chunk };
          }
          return copy;
        });
      }
    } catch {
      setMessages(next);
      setError("The connection was interrupted. Please try again.");
    } finally {
      setStreaming(false);
    }
  }, [input, messages, streaming]);

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
            Ask something like &ldquo;What&apos;s in the current sprint?&rdquo; or &ldquo;Show me
            open bugs in ENG.&rdquo;
          </p>
        ) : (
          messages.map((m, i) => <Bubble key={i} message={m} streaming={streaming} last={i === messages.length - 1} />)
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
          placeholder="Ask about your projects, tasks, or sprints…"
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
}: {
  message: ChatMessage;
  streaming: boolean;
  last: boolean;
}) {
  const isUser = message.role === "user";
  // The streaming assistant bubble is a live region so screen readers announce
  // incoming text; a thinking hint shows while it's still empty.
  const isStreamingAssistant = !isUser && last && streaming;
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        aria-live={isStreamingAssistant ? "polite" : undefined}
        className={
          isUser
            ? "max-w-[80%] whitespace-pre-wrap rounded-lg bg-brand-600 px-3 py-2 text-sm text-white"
            : "max-w-[80%] whitespace-pre-wrap rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-900"
        }
      >
        {message.content || (isStreamingAssistant ? <span className="text-gray-400">Thinking…</span> : null)}
      </div>
    </div>
  );
}
