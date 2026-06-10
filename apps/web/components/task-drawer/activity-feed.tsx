"use client";

// Compact audit trail under the comments. Entries come pre-sorted
// newest-first from listActivityForTask.

type Entry = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
  actor: string | null;
};

const FIELD_LABEL: Record<string, string> = {
  status_changed: "status",
  assignee_changed: "assignee",
  priority_changed: "priority",
  type_changed: "type",
  due_changed: "due date",
  points_changed: "points",
  milestone_changed: "milestone",
};

function describe(entry: Entry): string {
  if (entry.type === "task_created") return "created this task";
  if (entry.type === "comment_added") return "commented";
  const field = FIELD_LABEL[entry.type] ?? entry.type;
  const from = entry.payload.from;
  const to = entry.payload.to;
  if (to === null || to === undefined) return `cleared ${field}`;
  if (from === null || from === undefined) return `set ${field} to ${String(to)}`;
  return `changed ${field}: ${String(from)} → ${String(to)}`;
}

export function ActivityFeed({ entries }: { entries: Entry[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="mb-6">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Activity</p>
      <ul className="space-y-1.5 border-l border-gray-200 pl-3">
        {entries.map((e) => (
          <li key={e.id} className="text-xs text-gray-600">
            <span className="font-medium text-gray-700">{e.actor ?? "API"}</span>{" "}
            {describe(e)}
            <span className="ml-1.5 text-gray-400">
              {e.createdAt.slice(0, 16).replace("T", " ")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
