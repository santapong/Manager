import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { projects } from "@manager/db";
import { withActiveWorkspace } from "@/src/lib/workspace-context";
import * as milestoneService from "@/src/server/milestones";
import { NewMilestoneButton } from "./new-milestone-button";

export const dynamic = "force-dynamic";

/**
 * Project milestones — RSC fetches the list + progress per milestone and
 * renders cards. The "New milestone" button is a client component that
 * opens a dialog.
 */
export default async function MilestonesPage({
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
    const list = await milestoneService.list(tx, ws.id, project.id);
    const withProgress = await Promise.all(
      list.map(async (m) => ({
        milestone: m,
        progress: await milestoneService.progress(tx, ws.id, m.id),
      })),
    );
    return { project, items: withProgress };
  });
  if (!data) notFound();

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-mono text-gray-500">
            <Link
              href={`/${slug}/projects/${projectKey}`}
              className="hover:text-gray-700 hover:underline"
            >
              {data.project.key}
            </Link>
          </p>
          <h1 className="text-xl font-semibold tracking-tight">Milestones</h1>
        </div>
        <NewMilestoneButton workspaceSlug={slug} projectId={data.project.id} />
      </header>

      {data.items.length === 0 ? (
        <p className="rounded-md border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          No milestones yet. Use the New milestone button or import a plan to populate them.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {data.items.map(({ milestone, progress }) => {
            const pct =
              progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100);
            const slipping =
              milestone.status === "open" &&
              !!milestone.targetDate &&
              milestone.targetDate < today &&
              progress.done < progress.total;
            return (
              <li
                key={milestone.id}
                className="rounded-md border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="mb-1 flex items-start justify-between gap-2">
                  <Link
                    href={`/${slug}/projects/${projectKey}/board?milestone=${milestone.id}`}
                    className="text-sm font-semibold text-gray-900 hover:underline"
                  >
                    {milestone.name}
                  </Link>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      milestone.status === "closed"
                        ? "bg-gray-100 text-gray-600"
                        : slipping
                          ? "bg-red-100 text-red-700"
                          : "bg-green-100 text-green-700"
                    }`}
                  >
                    {milestone.status === "closed"
                      ? "Closed"
                      : slipping
                        ? "Slipping"
                        : "On track"}
                  </span>
                </div>
                {milestone.targetDate ? (
                  <p
                    className={`mb-2 text-xs ${
                      slipping ? "text-red-700" : "text-gray-500"
                    }`}
                  >
                    Target {milestone.targetDate}
                  </p>
                ) : (
                  <p className="mb-2 text-xs text-gray-400">No target date</p>
                )}
                {milestone.description ? (
                  <p className="mb-3 text-sm text-gray-700">{milestone.description}</p>
                ) : null}

                <div className="mt-3">
                  <div
                    className="h-2 w-full overflow-hidden rounded-full bg-gray-100"
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Progress: ${progress.done} of ${progress.total} tasks done`}
                  >
                    <div
                      className="h-full bg-brand-500 transition-[width]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {progress.done} / {progress.total} tasks done
                    {progress.inProgress
                      ? ` · ${progress.inProgress} in progress`
                      : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
