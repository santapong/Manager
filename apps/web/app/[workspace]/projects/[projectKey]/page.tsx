import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { projects } from "@manager/db";
import { listMembers, listTasks } from "@manager/db/queries";
import { withActiveWorkspace } from "@/src/lib/workspace-context";
import * as labelService from "@/src/server/labels";
import * as milestoneService from "@/src/server/milestones";
import { parseListFilters } from "@/src/lib/validators/task";
import { FilterBar } from "./filter-bar";
import { NewTaskForm } from "./new-task-form";
import { TaskRow } from "./task-row";
import { ProjectHeader } from "./project-header";
import { ProjectTabs } from "./project-tabs";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string; projectKey: string }>;
  searchParams: Promise<Record<string, string | undefined> & { task?: string }>;
}) {
  const [{ workspace: slug, projectKey }, sp] = await Promise.all([params, searchParams]);
  const openTaskId = sp.task;
  const filters = parseListFilters(sp);
  const data = await withActiveWorkspace(async (tx, ws) => {
    // Explicit workspace_id alongside RLS: the owner connection bypasses
    // policies, and project keys are only unique per workspace.
    const [project] = await tx
      .select()
      .from(projects)
      .where(and(eq(projects.workspaceId, ws.id), eq(projects.key, projectKey)))
      .limit(1);
    if (!project) return null;
    const tasks = await listTasks(tx, project.id, filters);
    const tags = await labelService.listForProject(tx, project.id);
    const milestones = await milestoneService.list(tx, ws.id, project.id);
    const milestoneProgress = await Promise.all(
      milestones.map((m) => milestoneService.progress(tx, ws.id, m.id)),
    );
    const members = await listMembers(tx, ws.id);
    return { project, tasks, tags, milestones, milestoneProgress, members };
  });
  if (!data) notFound();

  const memberById = new Map(data.members.map((m) => [m.userId, m.name ?? m.email] as const));

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

      <ProjectTabs workspaceSlug={slug} projectKey={projectKey} active="tasks" />

      <FilterBar
        members={data.members.map((m) => ({ userId: m.userId, label: m.name ?? m.email }))}
      />

      <NewTaskForm workspaceSlug={slug} projectKey={projectKey} />

      {data.tasks.length === 0 ? (
        <p className="rounded-md border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          {Object.values(filters).some(Boolean)
            ? "No tasks match the current filters."
            : "No tasks yet. Add one above."}
        </p>
      ) : (
        <ul className="divide-y divide-gray-200 rounded-md border border-gray-200">
          {data.tasks.map((task) => (
            <TaskRow
              key={task.id}
              workspaceSlug={slug}
              projectKey={projectKey}
              initialOpen={task.id === openTaskId}
              task={{
                id: task.id,
                key: task.key,
                title: task.title,
                status: task.status,
                priority: task.priority,
                type: task.type,
                dueAt: task.dueAt ? task.dueAt.toISOString().slice(0, 10) : null,
                assignee: task.assigneeId ? (memberById.get(task.assigneeId) ?? null) : null,
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
