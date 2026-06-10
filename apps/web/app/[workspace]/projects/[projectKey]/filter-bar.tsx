"use client";

// List view filters/sort persisted in the URL — shareable, and the exact
// shape Phase 2 "saved views" will store.

import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Member = { userId: string; label: string };

const FILTER_KEYS = ["status", "priority", "type", "assignee", "sort", "dir"] as const;

export function FilterBar({ members }: { members: Member[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`${pathname}${params.size ? `?${params}` : ""}`);
  }

  function clearAll() {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of FILTER_KEYS) params.delete(key);
    router.replace(`${pathname}${params.size ? `?${params}` : ""}`);
  }

  const hasFilters = FILTER_KEYS.some((k) => searchParams.has(k));
  const cls =
    "rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="f-status" className="sr-only">
        Filter by status
      </label>
      <select
        id="f-status"
        value={searchParams.get("status") ?? ""}
        onChange={(e) => setParam("status", e.target.value)}
        className={cls}
      >
        <option value="">Status: all</option>
        <option value="open">Open</option>
        <option value="in_progress">In progress</option>
        <option value="done">Done</option>
      </select>

      <label htmlFor="f-priority" className="sr-only">
        Filter by priority
      </label>
      <select
        id="f-priority"
        value={searchParams.get("priority") ?? ""}
        onChange={(e) => setParam("priority", e.target.value)}
        className={cls}
      >
        <option value="">Priority: all</option>
        <option value="urgent">Urgent</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>

      <label htmlFor="f-type" className="sr-only">
        Filter by type
      </label>
      <select
        id="f-type"
        value={searchParams.get("type") ?? ""}
        onChange={(e) => setParam("type", e.target.value)}
        className={cls}
      >
        <option value="">Type: all</option>
        <option value="task">Task</option>
        <option value="story">Story</option>
        <option value="bug">Bug</option>
        <option value="epic">Epic</option>
      </select>

      <label htmlFor="f-assignee" className="sr-only">
        Filter by assignee
      </label>
      <select
        id="f-assignee"
        value={searchParams.get("assignee") ?? ""}
        onChange={(e) => setParam("assignee", e.target.value)}
        className={cls}
      >
        <option value="">Assignee: all</option>
        <option value="none">Unassigned</option>
        {members.map((m) => (
          <option key={m.userId} value={m.userId}>
            {m.label}
          </option>
        ))}
      </select>

      <label htmlFor="f-sort" className="sr-only">
        Sort by
      </label>
      <select
        id="f-sort"
        value={searchParams.get("sort") ?? "position"}
        onChange={(e) => setParam("sort", e.target.value === "position" ? "" : e.target.value)}
        className={cls}
      >
        <option value="position">Sort: manual</option>
        <option value="due">Due date</option>
        <option value="priority">Priority</option>
        <option value="points">Points</option>
        <option value="updated">Updated</option>
      </select>

      <button
        type="button"
        onClick={() =>
          setParam("dir", (searchParams.get("dir") ?? "asc") === "asc" ? "desc" : "")
        }
        title="Toggle sort direction"
        className={cls}
      >
        {(searchParams.get("dir") ?? "asc") === "asc" ? "↑ asc" : "↓ desc"}
      </button>

      {hasFilters ? (
        <button
          type="button"
          onClick={clearAll}
          className="text-xs text-gray-500 hover:text-gray-900"
        >
          Clear all
        </button>
      ) : null}
    </div>
  );
}
