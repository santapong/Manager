"use client";

// Client component — the live channel view. Interactive: optimistic message
// append (useOptimistic + useTransition), keyboard-driven composer, and an
// optional realtime subscription. Realtime is best-effort: when
// /api/realtime/token 404s (no provider configured) the hook stays silent and
// we rely on the action's revalidatePath to refresh the RSC tree.

import {
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { postMessageAction } from "./actions";

export interface ChatRoomMessage {
  id: string;
  authorId: string | null;
  authorName: string | null;
  authorEmail: string | null;
  body: string;
  createdAt: string;
}

type OptimisticMessage = ChatRoomMessage & { pending?: boolean };

function displayName(m: ChatRoomMessage, currentUserName: string): string {
  if (m.authorName) return m.authorName;
  if (m.authorEmail) return m.authorEmail;
  return m.authorId === null ? "Unknown" : currentUserName;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function shortTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function ChatRoom({
  slug,
  wsId,
  channelId,
  channelName,
  currentUserId,
  currentUserName,
  initialMessages,
}: {
  slug: string;
  wsId: string;
  channelId: string;
  channelName: string;
  currentUserId: string;
  currentUserName: string;
  initialMessages: ChatRoomMessage[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [optimisticMessages, addOptimistic] = useOptimistic(
    initialMessages as OptimisticMessage[],
    (state, next: OptimisticMessage) => [...state, next],
  );

  // Keep the newest message in view as the list grows.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [optimisticMessages]);

  // Optional realtime: probe the token endpoint; on 404 (no provider) stay
  // silent. Otherwise lazily load the vendor client and refresh on each event.
  useEffect(() => {
    const channel = `ws:${wsId}:chat:${channelId}`;
    let cancelled = false;
    let sub: { unsubscribe(): void } | undefined;

    (async () => {
      const tokenUrl = `/api/realtime/token?channel=${encodeURIComponent(channel)}`;
      const probe = await fetch(tokenUrl).catch(() => null);
      if (cancelled || !probe?.ok) return;
      const { subscribeToChannel } = await import("@manager/realtime/browser");
      if (cancelled) return;
      sub = subscribeToChannel({
        tokenUrl,
        channel,
        onEvent: () => router.refresh(),
      });
    })();

    return () => {
      cancelled = true;
      sub?.unsubscribe();
    };
  }, [wsId, channelId, router]);

  function submit() {
    const body = input.trim();
    if (!body || isPending) return;
    setError(null);
    setInput("");

    const optimistic: OptimisticMessage = {
      id: `optimistic-${crypto.randomUUID()}`,
      authorId: currentUserId,
      authorName: currentUserName,
      authorEmail: null,
      body,
      createdAt: new Date().toISOString(),
      pending: true,
    };

    startTransition(async () => {
      addOptimistic(optimistic);
      const fd = new FormData();
      fd.append("channelId", channelId);
      fd.append("body", body);
      const res = await postMessageAction(slug, fd);
      if ("error" in res && res.error) {
        // The transition unwinds the optimistic entry once it completes; surface
        // the failure and restore the draft so the user can retry.
        setError("Message failed to send. Please try again.");
        setInput(body);
        return;
      }
      // Success: revalidatePath swaps in the server-rendered list. The optimistic
      // entry is dropped automatically when the transition settles.
      router.refresh();
    });
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    submit();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter inserts a newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <section
      aria-label={`Channel ${channelName}`}
      className="flex min-h-[60vh] flex-1 flex-col rounded-md border border-gray-200 bg-white"
    >
      <header className="border-b border-gray-200 px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight">
          <span className="text-gray-400">#</span> {channelName}
        </h2>
      </header>

      <div
        ref={scrollRef}
        aria-live="polite"
        aria-label={`Messages in ${channelName}`}
        className="flex-1 space-y-3 overflow-y-auto p-4"
      >
        {optimisticMessages.length === 0 ? (
          <p className="rounded-md border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
            No messages yet. Say hello to start the conversation.
          </p>
        ) : (
          optimisticMessages.map((m) => {
            const mine = m.authorId === currentUserId;
            const name = displayName(m, currentUserName);
            return (
              <div key={m.id} className={mine ? "flex justify-end" : "flex gap-2"}>
                {!mine ? (
                  <span
                    aria-hidden
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[11px] font-medium text-gray-700"
                  >
                    {initials(name)}
                  </span>
                ) : null}
                <div className={mine ? "max-w-[80%]" : "min-w-0 max-w-[80%]"}>
                  <div
                    className={
                      mine
                        ? "flex items-baseline justify-end gap-2"
                        : "flex items-baseline gap-2"
                    }
                  >
                    <span className="text-xs font-medium text-gray-900">{mine ? "You" : name}</span>
                    <time
                      dateTime={m.createdAt}
                      className="font-mono text-[11px] text-gray-400"
                    >
                      {shortTime(m.createdAt)}
                    </time>
                  </div>
                  <div
                    className={
                      mine
                        ? `mt-0.5 whitespace-pre-wrap break-words rounded-lg bg-brand-600 px-3 py-2 text-sm text-white ${
                            m.pending ? "opacity-70" : ""
                          }`
                        : "mt-0.5 whitespace-pre-wrap break-words rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-900"
                    }
                  >
                    {m.body}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={onSubmit} className="flex items-end gap-2 border-t border-gray-200 p-3">
        <label htmlFor="chat-composer" className="sr-only">
          Message #{channelName}
        </label>
        <textarea
          id="chat-composer"
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder={`Message #${channelName}…`}
          className="block flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <button
          type="submit"
          disabled={input.trim().length === 0}
          className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Send
        </button>
      </form>
      {error ? (
        <p role="alert" className="px-3 pb-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </section>
  );
}
