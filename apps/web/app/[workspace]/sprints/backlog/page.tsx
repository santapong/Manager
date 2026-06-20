import Link from "next/link";
import { listProjects } from "@manager/db/queries";
import { withActiveWorkspace } from "@/src/lib/workspace-context";
import { listAssignableSprints, listBacklog } from "@/src/server/sprints";
import { BacklogList, type BacklogRow, type SprintChoice } from "./backlog-list";

export const dynamic = "force-dynamic";

export default async function BacklogPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<{ project?: string }>;
}) {
  const { workspace: slug } = await params;
  const { project: projectParam } = await searchParams;

  const data = await withActiveWorkspace(async (tx, ws) => {
    const projects = await listProjects(tx, ws.id);
    // Only honor the filter if it names a real project in this workspace.
    const selectedProjectId =
      projectParam && projects.some((p) => p.id === projectParam) ? projectParam : null;
    const tasks = await listBacklog(tx, ws.id, selectedProjectId ?? undefined);

    // Assignable sprints only for the project ids actually present in the
    // backlog, so each row's "move to sprint" select has its choices.
    const projectIds = Array.from(new Set(tasks.map((t) => t.projectId)));
    const sprintLists = await Promise.all(
      projectIds.map((pid) => listAssignableSprints(tx, ws.id, pid)),
    );
    const sprintsByProject: Record<string, SprintChoice[]> = {};
    projectIds.forEach((pid, i) => {
      sprintsByProject[pid] = sprintLists[i] ?? [];
    });

    return { projects, selectedProjectId, tasks, sprintsByProject };
  });

  const rows: BacklogRow[] = data.tasks.map((t) => ({
    id: t.id,
    key: t.key,
    title: t.title,
    status: t.status,
    priority: t.priority,
    type: t.type,
    points: t.points,
    projectId: t.projectId,
    projectKey: t.projectKey,
  }));

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Backlog</h1>
          <p className="mt-0.5 text-sm text-gray-500">Tasks not assigned to a sprint.</p>
        </div>
        <Link
          href={`/${slug}/sprints`}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Sprints
        </Link>
      </header>

      {data.projects.length === 0 ? (
        <p className="rounded-md border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          Create a project to start filling the backlog.
        </p>
      ) : (
        <BacklogList
          workspaceSlug={slug}
          projects={data.projects.map((p) => ({ id: p.id, key: p.key, name: p.name }))}
          selectedProjectId={data.selectedProjectId}
          tasks={rows}
          sprintsByProject={data.sprintsByProject}
        />
      )}
    </div>
  );
}
