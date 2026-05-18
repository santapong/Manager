import Link from "next/link";
import { ImportForm } from "./import-form";

export const dynamic = "force-dynamic";

/**
 * Plan import surface. RSC shell that renders the client form.
 *
 * Per `docs/plans/decisions.md` we only support Markdown in this wave.
 * The form handles preview (paste OR upload) and commit in two steps.
 */
export default async function ImportPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Import a plan</h1>
        <p className="mt-1 text-sm text-gray-600">
          Paste a Markdown plan or upload a <span className="font-mono">.md</span> file. We will
          show you a diff before anything is created.{" "}
          <Link
            href="/docs/formats/markdown.md"
            className="text-brand-600 underline hover:text-brand-700"
          >
            Format spec
          </Link>
          .
        </p>
      </header>

      <ImportForm workspaceSlug={slug} />
    </div>
  );
}
