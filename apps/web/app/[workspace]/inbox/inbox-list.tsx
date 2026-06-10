"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { markAllReadAction, markReadAction } from "../_actions/notifications";

type Item = {
  id: string;
  type: "mention" | "assigned" | "comment";
  read: boolean;
  createdAt: string;
  actor: string | null;
  excerpt: string | null;
  task: { id: string; key: string; title: string; projectKey: string } | null;
  taskKey: string | null;
  taskTitle: string | null;
};

const TYPE_TEXT: Record<Item["type"], string> = {
  mention: "mentioned you on",
  assigned: "assigned you",
  comment: "commented on",
};

export function InboxList({ workspaceSlug, items }: { workspaceSlug: string; items: Item[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function open(item: Item) {
    startTransition(async () => {
      if (!item.read) await markReadAction(workspaceSlug, { id: item.id });
      if (item.task) {
        router.push(
          `/${workspaceSlug}/projects/${item.task.projectKey}?task=${item.task.id}`,
        );
      } else {
        router.refresh();
      }
    });
  }

  function markAll() {
    startTransition(async () => {
      await markAllReadAction(workspaceSlug);
      router.refresh();
    });
  }

  if (items.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
        Nothing here. Mentions and assignments will show up in this inbox.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={markAll}
          disabled={pending || items.every((i) => i.read)}
          className="text-xs text-gray-500 hover:text-gray-900 disabled:opacity-50"
        >
          Mark all as read
        </button>
      </div>
      <ul className="divide-y divide-gray-200 rounded-md border border-gray-200">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => open(item)}
              disabled={pending}
              className={`flex w-full items-baseline gap-2 px-4 py-3 text-left text-sm hover:bg-gray-50 ${
                item.read ? "opacity-60" : ""
              }`}
            >
              {!item.read ? (
                <span aria-label="Unread" className="h-2 w-2 shrink-0 rounded-full bg-brand-600" />
              ) : (
                <span aria-hidden className="h-2 w-2 shrink-0" />
              )}
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{item.actor ?? "Someone"}</span>{" "}
                <span className="text-gray-600">{TYPE_TEXT[item.type]}</span>{" "}
                <span className="font-mono text-xs text-gray-500">{item.taskKey}</span>{" "}
                <span>{item.taskTitle}</span>
                {item.excerpt ? (
                  <span className="mt-0.5 block truncate text-xs text-gray-500">
                    “{item.excerpt}”
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 font-mono text-xs text-gray-400">
                {item.createdAt.slice(0, 10)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
