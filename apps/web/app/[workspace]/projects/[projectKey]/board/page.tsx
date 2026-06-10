import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { projects } from "@manager/db";
import { listMembers, listTasks } from "@manager/db/queries";
import { projectChannel, REALTIME_ENABLED } from "@/src/lib/realtime";
import { withActiveWorkspace } from "@/src/lib/workspace-context";
import { ProjectTabs } from "../project-tabs";
import { Board, type BoardTask } from "./board";

export const dynamic = "force-dynamic";

export default async function BoardPage({
  params,
}: {
  params: Promise<{ workspace: string; projectKey: string }>;
}) {
  const { workspace: slug, projectKey } = await params;
  const data = await withActiveWorkspace(async (tx, ws) => {
    const [project] = await tx
      .select({ id: projects.id, key: projects.key, name: projects.name })
      .from(projects)
      .where(and(eq(projects.workspaceId, ws.id), eq(projects.key, projectKey)))
      .limit(1);
    if (!project) return null;
    const [tasks, members] = await Promise.all([
      listTasks(tx, project.id),
      listMembers(tx, ws.id),
    ]);
    return { project, tasks, members, workspaceId: ws.id };
  });
  if (!data) notFound();

  const memberById = new Map(data.members.map((m) => [m.userId, m.name ?? m.email] as const));
  const tasks: BoardTask[] = data.tasks.map((t) => ({
    id: t.id,
    key: t.key,
    title: t.title,
    status: t.status,
    priority: t.priority,
    type: t.type,
    dueAt: t.dueAt ? t.dueAt.toISOString().slice(0, 10) : null,
    assignee: t.assigneeId ? (memberById.get(t.assigneeId) ?? null) : null,
  }));

  return (
    <div className="space-y-6">
      <header>
        <p className="font-mono text-xs text-gray-500">{data.project.key}</p>
        <h1 className="text-xl font-semibold tracking-tight">{data.project.name}</h1>
      </header>
      <ProjectTabs workspaceSlug={slug} projectKey={projectKey} active="board" />
      <Board
        workspaceSlug={slug}
        projectKey={projectKey}
        tasks={tasks}
        channel={REALTIME_ENABLED ? projectChannel(data.workspaceId, data.project.id) : null}
      />
    </div>
  );
}
