"use client";

// Client component — create-channel form. Interactive: useActionState pairs
// with the (slug, prev, formData) Server Action, and on success we navigate to
// the freshly created channel.

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createChannelAction } from "./actions";

type CreateState = { ok?: true; id?: string; error?: string };

/**
 * Channel-list rail shared by both chat pages. Pure navigation (Links) plus the
 * create form, so it lives here alongside NewChannel rather than leaking a
 * component export out of a route's page.tsx. `activeId` highlights the open
 * channel.
 */
export function ChannelList({
  slug,
  channels,
  activeId,
}: {
  slug: string;
  channels: { id: string; name: string }[];
  activeId?: string;
}) {
  return (
    <aside className="w-full shrink-0 space-y-3 md:w-64">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Chat</h1>
      </header>
      <NewChannel slug={slug} />
      {channels.length > 0 ? (
        <nav aria-label="Channels">
          <ul className="divide-y divide-gray-200 rounded-md border border-gray-200">
            {channels.map((c) => {
              const active = c.id === activeId;
              return (
                <li key={c.id}>
                  <Link
                    href={`/${slug}/chat/${c.id}`}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-baseline gap-1 px-3 py-2 text-sm hover:bg-gray-50 ${
                      active ? "bg-gray-50 font-medium text-gray-900" : "text-gray-700"
                    }`}
                  >
                    <span className="text-gray-400">#</span>
                    <span className="truncate">{c.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </aside>
  );
}

export function NewChannel({ slug }: { slug: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const bound = createChannelAction.bind(null, slug);
  const [state, action, pending] = useActionState<CreateState, FormData>(bound, {});

  useEffect(() => {
    if (state.ok && state.id) {
      formRef.current?.reset();
      router.push(`/${slug}/chat/${state.id}`);
    }
  }, [state.ok, state.id, router, slug]);

  return (
    <form ref={formRef} action={action} className="space-y-2">
      <div className="flex gap-2">
        <label htmlFor="chat-channel-name" className="sr-only">
          New channel name
        </label>
        <input
          id="chat-channel-name"
          name="name"
          type="text"
          required
          maxLength={80}
          placeholder="New channel…"
          className="block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
