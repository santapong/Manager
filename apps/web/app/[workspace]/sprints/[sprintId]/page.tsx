import Link from "next/link";
import { notFound } from "next/navigation";
import { withActiveWorkspace } from "@/src/lib/workspace-context";
import { getSprint, listSprintTasks, sprintBurndown, type SprintDetail } from "@/src/server/sprints";
import { SprintBoard, type SprintBoardTask } from "./sprint-board";
import { SprintBurndown } from "./sprint-burndown";
import { DeleteSprintButton, FinishSprintButton, StartSprintButton } from "./sprint-actions";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<SprintDetail["status"], { label: string; cls: string }> = {
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
  return "No dates set";
}

export default async function SprintDetailPage({
  params,
}: {
  params: Promise<{ workspace: string; sprintId: string }>;
}) {
  const { workspace: slug, sprintId } = await params;
  const data = await withActiveWorkspace(async (tx, ws) => {
    const sprint = await getSprint(tx, ws.id, sprintId);
    if (!sprint) return null;
    const [tasks, burndown] = await Promise.all([
      listSprintTasks(tx, ws.id, sprintId),
      sprintBurndown(tx, ws.id, sprintId),
    ]);
    return { sprint, tasks, burndown };
  });
  if (!data) notFound();

  const { sprint, tasks, burndown } = data;
  const badge = STATUS_BADGE[sprint.status];
  const boardTasks: SprintBoardTask[] = tasks.map((t) => ({
    id: t.id,
    key: t.key,
    title: t.title,
    status: t.status,
    priority: t.priority,
    type: t.type,
    points: t.points,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/${slug}/sprints`} className="text-xs text-gray-500 hover:underline">
          ← Sprints
        </Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{sprint.name}</h1>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}>
              {badge.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            <span className="font-mono">{sprint.projectKey}</span> · {dateRange(sprint.startAt, sprint.endAt)}
          </p>
          {sprint.goal ? <p className="mt-2 max-w-prose text-sm text-gray-700">{sprint.goal}</p> : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {sprint.status === "planned" ? (
            <StartSprintButton workspaceSlug={slug} sprintId={sprint.id} />
          ) : null}
          {sprint.status === "active" ? (
            <FinishSprintButton workspaceSlug={slug} sprintId={sprint.id} />
          ) : null}
          <DeleteSprintButton workspaceSlug={slug} sprintId={sprint.id} />
        </div>
      </header>

      <section aria-labelledby="burndown-heading" className="rounded-md border border-gray-200 p-4">
        <h2 id="burndown-heading" className="mb-3 text-sm font-semibold text-gray-700">
          Burndown
        </h2>
        <SprintBurndown data={burndown} />
      </section>

      <section aria-labelledby="board-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="board-heading" className="text-sm font-semibold text-gray-700">
            Board
          </h2>
          <Link href={`/${slug}/sprints/backlog`} className="text-xs text-brand-600 hover:underline">
            Add from backlog
          </Link>
        </div>
        {boardTasks.length === 0 ? (
          <p className="rounded-md border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
            No tasks in this sprint yet. Move work in from the{" "}
            <Link href={`/${slug}/sprints/backlog`} className="text-brand-600 hover:underline">
              backlog
            </Link>
            .
          </p>
        ) : (
          <SprintBoard workspaceSlug={slug} sprintId={sprint.id} tasks={boardTasks} />
        )}
      </section>
    </div>
  );
}
