"use client";

// Client component — drives a multi-step paste/upload → preview → commit flow
// with `useActionState` for preview and `useTransition` for the commit step.

import { useActionState, useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import type { PlanIR } from "@manager/plan-ir";
import { previewPlanAction, commitPlanAction } from "./actions";
import { ImportDiffPanel, type ImportPreviewState } from "./diff-panel";

type Tab = "paste" | "upload";

const MAX_BYTES = 5 * 1024 * 1024;

const initialPreview: ImportPreviewState = {};

export function ImportForm({ workspaceSlug }: { workspaceSlug: string }) {
  const [tab, setTab] = useState<Tab>("paste");
  const router = useRouter();
  const [preview, previewAction, previewing] = useActionState<ImportPreviewState, FormData>(
    previewPlanAction,
    initialPreview,
  );
  const [committing, startCommit] = useTransition();
  const [commitError, setCommitError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedContent, setUploadedContent] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function onPickFile(file: File) {
    setUploadError(null);
    if (file.size > MAX_BYTES) {
      setUploadError("File too large (limit 5 MB).");
      return;
    }
    const text = await file.text();
    setUploadedContent(text);
  }

  function onCommit(ir: PlanIR) {
    setCommitError(null);
    startCommit(async () => {
      const res = await commitPlanAction(workspaceSlug, ir);
      if ("error" in res && res.error) {
        setCommitError(res.error);
        return;
      }
      const projectKey = ir.project.key;
      router.push(`/${workspaceSlug}/projects/${projectKey}?imported=1`);
    });
  }

  const hasIr = preview.ok && !!preview.ir;

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Import source" className="flex gap-2 border-b border-gray-200">
        <TabButton active={tab === "paste"} onClick={() => setTab("paste")} controls="paste-panel">
          Paste Markdown
        </TabButton>
        <TabButton active={tab === "upload"} onClick={() => setTab("upload")} controls="upload-panel">
          Upload file
        </TabButton>
      </div>

      <form action={previewAction} className="space-y-4">
        <input type="hidden" name="format" value="markdown" />

        {tab === "paste" ? (
          <div id="paste-panel" role="tabpanel">
            <label htmlFor="content" className="block text-sm font-medium text-gray-700">
              Markdown source
            </label>
            <textarea
              id="content"
              name="content"
              required
              minLength={1}
              maxLength={MAX_BYTES}
              rows={14}
              placeholder="---&#10;plan-format: 1&#10;project:&#10;  key: PROJ&#10;  name: My project&#10;---&#10;&#10;# My project"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        ) : (
          <div id="upload-panel" role="tabpanel">
            <label htmlFor="file" className="block text-sm font-medium text-gray-700">
              Markdown file
            </label>
            <input
              ref={fileInputRef}
              id="file"
              name="file"
              type="file"
              accept=".md,.markdown,text/markdown,text/plain"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onPickFile(f);
              }}
              className="mt-1 block w-full text-sm file:mr-3 file:rounded-md file:border file:border-gray-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-gray-50"
            />
            {/* The previewPlanAction reads `content`, so we mirror file text into a hidden field. */}
            <input type="hidden" name="content" value={uploadedContent} />
            {uploadError ? (
              <p role="alert" className="mt-2 text-sm text-red-600">
                {uploadError}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-gray-500">
              File is read in your browser and sent through the same Server Action as paste — limit
              5 MB.
            </p>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={previewing || (tab === "upload" && !uploadedContent)}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {previewing ? "Previewing…" : "Preview"}
          </button>
          {preview.error ? (
            <p role="alert" className="text-sm text-red-600">
              {preview.error}
            </p>
          ) : null}
        </div>
      </form>

      {hasIr && preview.ir && preview.diff && preview.diagnostics ? (
        <section aria-label="Import preview" className="space-y-4">
          <ImportDiffPanel diff={preview.diff} diagnostics={preview.diagnostics} ir={preview.ir} />

          <div className="flex items-center gap-3 border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={() => onCommit(preview.ir!)}
              disabled={committing || hasBlockingError(preview.diagnostics)}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {committing ? "Committing…" : "Commit import"}
            </button>
            {hasBlockingError(preview.diagnostics) ? (
              <p className="text-sm text-amber-700">
                Resolve parser errors before committing.
              </p>
            ) : null}
            {commitError ? (
              <p role="alert" className="text-sm text-red-600">
                {commitError}
              </p>
            ) : null}
          </div>
        </section>
      ) : (
        <EmptyState />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  controls,
  children,
}: {
  active: boolean;
  onClick: () => void;
  controls: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={controls}
      onClick={onClick}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
        active
          ? "border-brand-600 text-brand-700"
          : "border-transparent text-gray-500 hover:text-gray-700"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="rounded-md border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
      <p className="mb-2">Paste or upload a Markdown plan to see the diff.</p>
      <p>
        See the{" "}
        <a
          href="/docs/formats/markdown.md"
          className="text-brand-600 underline hover:text-brand-700"
        >
          format spec
        </a>{" "}
        for the exact shape we expect.
      </p>
    </div>
  );
}

function hasBlockingError(diagnostics: ImportPreviewState["diagnostics"]) {
  return !!diagnostics?.some((d) => d.level === "error");
}
