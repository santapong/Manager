import Link from "next/link";
import { withActiveWorkspace } from "@/src/lib/workspace-context";
import { listProjects } from "@manager/db/queries";

export const dynamic = "force-dynamic";

export default async function WorkspaceHomePage() {
  const projects = await withActiveWorkspace(async (tx, ws) => listProjects(tx, ws.id));
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
        <Link
          href="./projects/new"
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          New project
        </Link>
      </header>
      {projects.length === 0 ? (
        <p className="rounded-md border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          No projects yet. Create one to start tracking work.
        </p>
      ) : (
        <ul className="divide-y divide-gray-200 rounded-md border border-gray-200">
          {projects.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-4 py-3">
              <span className="font-medium">{p.name}</span>
              <span className="font-mono text-xs text-gray-500">{p.key}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
