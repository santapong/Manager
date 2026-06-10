import Link from "next/link";
import { searchService } from "@/src/lib/search";
import { getActiveWorkspace } from "@/src/lib/workspace-context";
import { STATUS_LABEL } from "@/src/lib/task-ui";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const [{ workspace: slug }, { q }] = await Promise.all([params, searchParams]);
  const query = (q ?? "").trim();

  const ws = await getActiveWorkspace();
  const hits = ws && query ? await searchService().search(ws.id, query, { limit: 50 }) : [];

  const byProject = new Map<string, typeof hits>();
  for (const hit of hits) {
    const group = byProject.get(hit.projectKey) ?? [];
    group.push(hit);
    byProject.set(hit.projectKey, group);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Search</h1>
      </header>

      <form action={`/${slug}/search`} method="get" className="flex gap-2">
        <label htmlFor="search-q" className="sr-only">
          Search tasks
        </label>
        <input
          id="search-q"
          name="q"
          type="search"
          defaultValue={query}
          placeholder="Search tasks by key, title, or description…"
          autoFocus
          className="block w-full max-w-lg rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <button
          type="submit"
          className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Search
        </button>
      </form>

      {query === "" ? (
        <p className="text-sm text-gray-500">Type a query to search across all projects.</p>
      ) : hits.length === 0 ? (
        <p className="rounded-md border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          No tasks match “{query}”.
        </p>
      ) : (
        <div className="space-y-6">
          {Array.from(byProject.entries()).map(([projectKey, group]) => (
            <section key={projectKey}>
              <h2 className="mb-2 font-mono text-xs font-semibold uppercase tracking-wide text-gray-500">
                {projectKey}
              </h2>
              <ul className="divide-y divide-gray-200 rounded-md border border-gray-200">
                {group.map((hit) => (
                  <li key={hit.id}>
                    <Link
                      href={`/${slug}/projects/${hit.projectKey}?task=${hit.id}`}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50"
                    >
                      <span className="w-20 shrink-0 font-mono text-xs text-gray-500">
                        {hit.key}
                      </span>
                      <span className="flex-1 truncate">{hit.title}</span>
                      <span className="shrink-0 text-xs text-gray-400">
                        {STATUS_LABEL[hit.status]}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
