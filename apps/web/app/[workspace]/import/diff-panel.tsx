"use client";

// Client component (interactive disclosure) — renders the structured diff returned
// by `previewPlanAction` (creates / skips / diagnostics). Pure presentation, no
// network calls.

import type { Diagnostic, PlanIR } from "@manager/plan-ir";
import type { ImportDiff } from "@/src/server/imports/types";

export interface ImportPreviewState {
  ok?: true;
  ir?: PlanIR;
  diff?: ImportDiff;
  diagnostics?: Diagnostic[];
  error?: string;
}

export function ImportDiffPanel({
  diff,
  diagnostics,
  ir,
}: {
  diff: ImportDiff;
  diagnostics: Diagnostic[];
  ir: PlanIR;
}) {
  const totalCreates =
    (diff.creates.project ? 1 : 0) +
    diff.creates.milestones.length +
    diff.creates.tasks.length +
    diff.creates.subtasks.length +
    diff.creates.labels.length +
    diff.creates.taskLinks.length;

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
        <p>
          Importing project <span className="font-mono">{ir.project.key}</span> —{" "}
          <strong>{ir.project.name}</strong>
        </p>
        <p className="mt-1 text-xs text-gray-500">
          {totalCreates} entit{totalCreates === 1 ? "y" : "ies"} will be created,{" "}
          {diff.skips.length} skipped, {diagnostics.length} diagnostic
          {diagnostics.length === 1 ? "" : "s"}.
        </p>
      </div>

      <Section title="Creates" count={totalCreates}>
        {diff.creates.project ? (
          <Row icon="+" label="project">
            <span className="font-mono">{diff.creates.project.key}</span>{" "}
            <span className="text-gray-600">{diff.creates.project.name}</span>
          </Row>
        ) : null}
        {diff.creates.milestones.map((m) => (
          <Row key={`m-${m.name}`} icon="+" label="milestone">
            {m.name}
            {m.targetDate ? (
              <span className="ml-2 text-xs text-gray-500">target {m.targetDate}</span>
            ) : null}
          </Row>
        ))}
        {diff.creates.tasks.map((t, i) => {
          const subCount = diff.creates.subtasks.filter(
            (s) => (t.key && s.taskKey === t.key) || s.taskTitle === t.title,
          ).length;
          return (
            <Row key={`t-${t.key ?? t.title}-${i}`} icon="+" label="task">
              {t.key ? <span className="font-mono">{t.key}</span> : null}{" "}
              <span>{t.title}</span>
              {t.milestone ? (
                <span className="ml-2 text-xs text-gray-500">→ {t.milestone}</span>
              ) : null}
              {subCount ? (
                <span className="ml-2 text-xs text-gray-500">{subCount} subtask{subCount === 1 ? "" : "s"}</span>
              ) : null}
            </Row>
          );
        })}
        {diff.creates.labels.map((l) => (
          <Row key={`l-${l.name}`} icon="+" label="label">
            {l.name}
          </Row>
        ))}
        {diff.creates.taskLinks.map((l, i) => (
          <Row key={`tl-${i}`} icon="+" label="link">
            <span className="font-mono">{l.from}</span> {l.type}{" "}
            <span className="font-mono">{l.to}</span>
          </Row>
        ))}
      </Section>

      <Section title="Skips" count={diff.skips.length}>
        {diff.skips.map((s, i) => (
          <Row key={i} icon="·" label={s.kind} tone="muted">
            <span className="font-mono">{s.key}</span>{" "}
            <span className="text-xs text-gray-500">— {s.reason}</span>
          </Row>
        ))}
      </Section>

      <Section title="Diagnostics" count={diagnostics.length}>
        {diagnostics.map((d, i) => (
          <li
            key={i}
            className={`flex items-start gap-2 px-4 py-1.5 text-xs ${
              d.level === "error"
                ? "text-red-700"
                : d.level === "warn"
                  ? "text-amber-700"
                  : "text-gray-600"
            }`}
          >
            <span className="font-mono uppercase">{d.level}</span>
            <span className="flex-1">{d.message}</span>
            {d.line !== undefined ? (
              <span className="font-mono text-gray-400">L{d.line}</span>
            ) : null}
          </li>
        ))}
      </Section>
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <details open={count > 0} className="rounded-md border border-gray-200">
      <summary className="cursor-pointer list-none px-4 py-2 text-sm font-medium hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500">
        {title} <span className="text-gray-500">({count})</span>
      </summary>
      {count === 0 ? (
        <p className="px-4 py-2 text-xs text-gray-500">None.</p>
      ) : (
        <ul className="divide-y divide-gray-100">{children}</ul>
      )}
    </details>
  );
}

function Row({
  icon,
  label,
  tone = "default",
  children,
}: {
  icon: string;
  label: string;
  tone?: "default" | "muted";
  children: React.ReactNode;
}) {
  return (
    <li
      className={`flex items-center gap-2 px-4 py-1.5 text-sm ${
        tone === "muted" ? "text-gray-500" : ""
      }`}
    >
      <span
        aria-hidden
        className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-xs font-bold ${
          tone === "muted" ? "bg-gray-100 text-gray-400" : "bg-green-100 text-green-700"
        }`}
      >
        {icon}
      </span>
      <span className="w-20 shrink-0 text-xs uppercase tracking-wide text-gray-500">{label}</span>
      <span className="flex-1">{children}</span>
    </li>
  );
}
