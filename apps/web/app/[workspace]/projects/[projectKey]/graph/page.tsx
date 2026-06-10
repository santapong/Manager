import { notFound } from "next/navigation";
import Link from "next/link";
import { and, eq, inArray, or } from "drizzle-orm";
import { projectLinks, projects } from "@manager/db";
import { withActiveWorkspace } from "@/src/lib/workspace-context";
import { DependencyGraph } from "./dependency-graph";
import { ProjectTabs } from "../project-tabs";

export const dynamic = "force-dynamic";

/**
 * Project-level dependency graph. RSC fetches all `project_links` touching
 * this project + the related project rows, then renders a plain SVG node-edge
 * layout (decisions §10 — no react-flow).
 */
export default async function ProjectGraphPage({
  params,
}: {
  params: Promise<{ workspace: string; projectKey: string }>;
}) {
  const { workspace: slug, projectKey } = await params;

  const data = await withActiveWorkspace(async (tx, ws) => {
    const [project] = await tx
      .select()
      .from(projects)
      .where(and(eq(projects.workspaceId, ws.id), eq(projects.key, projectKey)))
      .limit(1);
    if (!project) return null;

    const links = await tx
      .select()
      .from(projectLinks)
      .where(
        and(
          eq(projectLinks.workspaceId, ws.id),
          or(
            eq(projectLinks.fromProjectId, project.id),
            eq(projectLinks.toProjectId, project.id),
          ),
        ),
      );

    const relatedIds = Array.from(
      new Set(
        links.flatMap((l) => [l.fromProjectId, l.toProjectId]).filter((id) => id !== project.id),
      ),
    );

    const related =
      relatedIds.length === 0
        ? []
        : await tx
            .select({ id: projects.id, key: projects.key, name: projects.name })
            .from(projects)
            .where(and(eq(projects.workspaceId, ws.id), inArray(projects.id, relatedIds)));

    return { project, links, related };
  });

  if (!data) notFound();

  const nodes = [
    { id: data.project.id, key: data.project.key, name: data.project.name, self: true },
    ...data.related.map((p) => ({ id: p.id, key: p.key, name: p.name, self: false })),
  ];

  return (
    <div className="space-y-6">
      <header>
        <p className="font-mono text-xs text-gray-500">
          <Link
            href={`/${slug}/projects/${projectKey}`}
            className="hover:text-gray-700 hover:underline"
          >
            {data.project.key}
          </Link>
        </p>
        <h1 className="text-xl font-semibold tracking-tight">Dependencies</h1>
        <p className="mt-1 text-sm text-gray-600">
          Project-level links that point to or from this project. Advisory only — no actions are
          blocked by these in v1.
        </p>
      </header>

      <ProjectTabs workspaceSlug={slug} projectKey={projectKey} active="graph" />

      {data.links.length === 0 ? (
        <p className="rounded-md border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          No dependencies. Link this project to another via the import flow or future link UI.
        </p>
      ) : (
        <DependencyGraph
          workspaceSlug={slug}
          selfId={data.project.id}
          nodes={nodes}
          edges={data.links.map((l) => ({
            id: l.id,
            from: l.fromProjectId,
            to: l.toProjectId,
            type: l.type,
          }))}
        />
      )}
    </div>
  );
}
