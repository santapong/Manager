import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { projects } from "@manager/db";
import { listTasks } from "@manager/db/queries";
import { withActiveWorkspace } from "@/src/lib/workspace-context";
import { NewTaskForm } from "./new-task-form";
import { TaskRow } from "./task-row";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ workspace: string; projectKey: string }>;
}) {
  const { workspace: slug, projectKey } = await params;
  const data = await withActiveWorkspace(async (tx) => {
    const [project] = await tx
      .select()
      .from(projects)
      .where(eq(projects.key, projectKey))
      .limit(1);
    if (!project) return null;
    const tasks = await listTasks(tx, project.id);
    return { project, tasks };
  });
  if (!data) notFound();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">{data.project.name}</h1>
        <p className="text-sm text-gray-500 font-mono">{data.project.key}</p>
      </header>

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
