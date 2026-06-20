import { notFound } from "next/navigation";
import { withActiveWorkspace } from "@/src/lib/workspace-context";
import { getDocument } from "@/src/server/documents";
import { DocEditor } from "./doc-editor";

export const dynamic = "force-dynamic";

/**
 * Single document view/edit. RSC loads the doc (404 if missing or not in the
 * active workspace) and hands it to the client editor seeded with its values.
 */
export default async function DocPage({
  params,
}: {
  params: Promise<{ workspace: string; docId: string }>;
}) {
  const { workspace: slug, docId } = await params;
  const doc = await withActiveWorkspace(async (tx, ws) => getDocument(tx, ws.id, docId));
  if (!doc) notFound();

  return (
    <DocEditor
      workspaceSlug={slug}
      doc={{ id: doc.id, title: doc.title, body: doc.body }}
    />
  );
}
