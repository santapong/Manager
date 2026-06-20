import Link from "next/link";
import { listProjects } from "@manager/db/queries";
import { withActiveWorkspace } from "@/src/lib/workspace-context";
import { listSprints, type SprintWithMeta } from "@/src/server/sprints";
import { NewSprintButton } from "./sprints-index";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<SprintWithMeta["status"], { label: string; cls: string }> = {
  active: { label: "Active", cls: "bg-emerald-100 text-emerald-700" },
  planned: { label: "Planned", cls: "bg-sky-100 text-sky-700" },
  completed: { label: "Completed", cls: "bg-gray-100 text-gray-600" },
};

function fmt(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

function dateRange(startAt: Date | null, endAt: Date | null): string {
  const s = fmt(startAt);
  const e = fmt(endAt);
  if (s && e) return `${s} → ${e}`;
  if (s) return `from ${s}`;
  if (e) return `until ${e}`;
  return "No dates";
}

export default async function SprintsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const { sprints, projects } = await withActiveWorkspace(async (tx, ws) => {
    const [sprints, projects] = await Promise.all([listSprints(tx, ws.id), listProjects(tx, ws.id)]);
    return { sprints, projects };
  });

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Sprints</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            <Link href={`/${slug}/sprints/backlog`} className="text-brand-600 hover:underline">
              View backlog
            </Link>
          </p>
        </div>
        <NewSprintButton
          workspaceSlug={slug}
          projects={projects.map((p) => ({ id: p.id, key: p.key, name: p.name }))}
        />
      </header>

      {projects.length === 0 ? (
        <p className="rounded-md border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          Create a project before planning sprints.
        </p>
      ) : sprints.length === 0 ? (
        <p className="rounded-md border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          No sprints yet. Create one to plan an iteration.
        </p>
      ) : (
        <ul className="divide-y divide-gray-200 rounded-md border border-gray-200">
          {sprints.map((s) => {
            const badge = STATUS_BADGE[s.status];
            return (
              <li key={s.id}>
                <Link
                  href={`/${slug}/sprints/${s.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-gray-50"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{s.name}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-gray-500">
                      <span className="font-mono">{s.projectKey}</span> · {dateRange(s.startAt, s.endAt)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-xs text-gray-500">
                    <div className="tabular-nums">
                      {s.taskCount} task{s.taskCount === 1 ? "" : "s"}
                    </div>
                    <div className="tabular-nums">
                      {s.donePoints}/{s.totalPoints} pts
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
