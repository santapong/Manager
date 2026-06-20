import Link from "next/link";
import { withActiveWorkspace } from "@/src/lib/workspace-context";
import { listDocuments } from "@/src/server/documents";
import { NewDocumentForm } from "./docs-index";

export const dynamic = "force-dynamic";

/**
 * Workspace documents (wiki) index. RSC fetches the list; a small client form
 * handles "New document" creation and navigation into the new doc.
 */
export default async function DocsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const docs = await withActiveWorkspace(async (tx, ws) => listDocuments(tx, ws.id));

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Docs</h1>
          <p className="mt-1 text-sm text-gray-600">
            Workspace wiki. Write in Markdown; everyone in the workspace can edit.
          </p>
        </div>
        <NewDocumentForm workspaceSlug={slug} />
      </header>

      {docs.length === 0 ? (
        <p className="rounded-md border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          No documents yet. Create one to start your workspace wiki.
        </p>
      ) : (
        <ul className="divide-y divide-gray-200 rounded-md border border-gray-200">
          {docs.map((doc) => (
            <li key={doc.id}>
              <Link
                href={`/${slug}/docs/${doc.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-gray-50"
              >
                <span className="min-w-0 truncate font-medium">{doc.title}</span>
                <span className="shrink-0 text-xs text-gray-500">
                  Updated {formatDate(doc.updatedAt)}
                  {doc.updatedByName || doc.updatedByEmail
                    ? ` by ${doc.updatedByName ?? doc.updatedByEmail}`
                    : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
