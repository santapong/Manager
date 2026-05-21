import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { projects } from "@manager/db";
import { listTasks } from "@manager/db/queries";
import { withActiveWorkspace } from "@/src/lib/workspace-context";
import * as labelService from "@/src/server/labels";
import * as milestoneService from "@/src/server/milestones";
import { NewTaskForm } from "./new-task-form";
import { TaskRow } from "./task-row";
import { ProjectHeader } from "./project-header";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ workspace: string; projectKey: string }>;
}) {
  const { workspace: slug, projectKey } = await params;
  const data = await withActiveWorkspace(async (tx, ws) => {
    const [project] = await tx
      .select()
      .from(projects)
      .where(eq(projects.key, projectKey))
      .limit(1);
    if (!project) return null;
    const tasks = await listTasks(tx, project.id);
    const tags = await labelService.listForProject(tx, project.id);
    const milestones = await milestoneService.list(tx, ws.id, project.id);
    const milestoneProgress = await Promise.all(
      milestones.map((m) => milestoneService.progress(tx, ws.id, m.id)),
    );
    return { project, tasks, tags, milestones, milestoneProgress };
  });
  if (!data) notFound();

  const today = new Date().toISOString().slice(0, 10);
  const launchStatus = computeLaunchStatus(
    data.project.targetDate,
    data.milestones,
    data.milestoneProgress,
    today,
  );

  return (
    <div className="space-y-6">
      <ProjectHeader
        workspaceSlug={slug}
        projectKey={projectKey}
        project={{
          id: data.project.id,
          key: data.project.key,
          name: data.project.name,
          targetDate: data.project.targetDate,
          startDate: data.project.startDate,
        }}
        tags={data.tags.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
        launchStatus={launchStatus}
      />

      <nav aria-label="Project sections" className="flex gap-4 border-b border-gray-200 text-sm">
        <Link
          href={`/${slug}/projects/${projectKey}`}
          className="-mb-px border-b-2 border-brand-600 px-1 py-2 font-medium text-brand-700"
        >
          Tasks
        </Link>
        <Link
          href={`/${slug}/projects/${projectKey}/milestones`}
          className="-mb-px border-b-2 border-transparent px-1 py-2 text-gray-500 hover:text-gray-900"
        >
          Milestones
        </Link>
        <Link
          href={`/${slug}/projects/${projectKey}/graph`}
          className="-mb-px border-b-2 border-transparent px-1 py-2 text-gray-500 hover:text-gray-900"
        >
          Dependencies
        </Link>
      </nav>

      <NewTaskForm workspaceSlug={slug} projectKey={projectKey} />

      {data.tasks.length === 0 ? (
        <p className="rounded-md border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          No tasks yet. Add one above.
        </p>
      ) : (
        <ul className="divide-y divide-gray-200 rounded-md border border-gray-200">
          {data.tasks.map((task) => (
            <TaskRow
              key={task.id}
              workspaceSlug={slug}
              projectKey={projectKey}
              task={{
                id: task.id,
                key: task.key,
                title: task.title,
                status: task.status,
                priority: task.priority,
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function computeLaunchStatus(
  targetDate: string | null,
  milestones: Array<{ id: string; status: "open" | "closed"; targetDate: string | null }>,
  progress: Array<{ done: number; total: number; milestoneId: string }>,
  today: string,
): "on-track" | "at-risk" | "slipped" | "none" {
  if (!targetDate) return "none";
  if (targetDate < today) return "slipped";

  // any open milestone past its date with unfinished work? -> slipped
  const progressById = new Map(progress.map((p) => [p.milestoneId, p]));
  let atRisk = false;
  for (const m of milestones) {
    if (m.status === "closed") continue;
    const p = progressById.get(m.id);
    if (!p || p.total === 0) continue;
    if (m.targetDate && m.targetDate < today && p.done < p.total) return "slipped";
    if (m.targetDate && m.targetDate <= today && p.done < p.total) atRisk = true;
  }
  return atRisk ? "at-risk" : "on-track";
}
