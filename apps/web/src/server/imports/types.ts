import type { Diagnostic, PlanIR } from "@manager/plan-ir";

/**
 * Backend-side import diff. Richer than `@manager/plan-ir`'s `PlanDiff`:
 * we report *every* entity class the importer would touch (projects,
 * milestones, tasks, subtasks, labels, links) so the preview UI can render
 * a structured plan-of-change.
 *
 * Collision policy = SKIP (decisions §7).
 */
export interface ImportDiff {
  creates: {
    project: { key: string; name: string } | null;
    milestones: Array<{ name: string; targetDate?: string | null }>;
    tasks: Array<{ key?: string; title: string; milestone?: string }>;
    subtasks: Array<{ taskKey?: string; taskTitle: string; title: string }>;
    labels: Array<{ name: string }>;
    /** task_links of type 'blocks' the importer would create. */
    taskLinks: Array<{ from: string; to: string; type: "blocks" }>;
  };
  skips: Array<{ kind: "project" | "task" | "milestone" | "label" | "link"; key: string; reason: string }>;
  conflicts: Array<{ kind: "task" | "milestone"; key: string; ours: unknown; theirs: unknown }>;
}

export interface CommitResult {
  createdIds: {
    projectId?: string;
    milestoneIds: string[];
    taskIds: string[];
    subtaskIds: string[];
    labelIds: string[];
    taskLinkIds: string[];
  };
  diagnostics: Diagnostic[];
  skipped: Array<{ kind: string; key: string; reason: string }>;
}

export interface ParseAndPreviewResult {
  ir: PlanIR;
  diff: ImportDiff;
  diagnostics: Diagnostic[];
}

export interface PreviewResult {
  diff: ImportDiff;
  diagnostics: Diagnostic[];
}
