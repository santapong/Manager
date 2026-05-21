import { and, eq, inArray } from "drizzle-orm";
import {
  labels as labelsTable,
  milestones as milestonesTable,
  projects as projectsTable,
  tasks as tasksTable,
  type Database,
} from "@manager/db";
import { PlanIRSchema, type Diagnostic, type PlanIR } from "@manager/plan-ir";
import type { ImportDiff, PreviewResult } from "./types";

/**
 * Compute a dry-run diff for a PlanIR against the current workspace state.
 *
 * Collision policy: SKIP (decisions §7). Existing project keys, task keys,
 * milestone names, and label names are reported as skips; nothing is updated.
 *
 * Runs under whatever workspace context the caller has set — RLS confines
 * the lookups for free.
 */
export async function preview(
  db: Database,
  workspaceId: string,
  ir: PlanIR,
): Promise<PreviewResult> {
  const diagnostics: Diagnostic[] = [];

  // Validate the IR shape up-front. Caller may have already done this, but
  // belt-and-suspenders: this is a public entry point.
  const parsed = PlanIRSchema.safeParse(ir);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      diagnostics.push({
        level: "error",
        code: "ir/invalid",
        message: `${issue.path.join(".") || "<root>"}: ${issue.message}`,
      });
    }
    return { diff: emptyDiff(), diagnostics };
  }

  const diff: ImportDiff = {
    creates: {
      project: null,
      milestones: [],
      tasks: [],
      subtasks: [],
      labels: [],
      taskLinks: [],
    },
    skips: [],
    conflicts: [],
  };

  // --- Project --------------------------------------------------------------
  const [existingProject] = await db
    .select({ id: projectsTable.id, key: projectsTable.key, name: projectsTable.name })
    .from(projectsTable)
    .where(and(eq(projectsTable.workspaceId, workspaceId), eq(projectsTable.key, ir.project.key)))
    .limit(1);

  if (existingProject) {
    diff.skips.push({
      kind: "project",
      key: ir.project.key,
      reason: "Project already exists; will reuse for child entities.",
    });
  } else {
    diff.creates.project = { key: ir.project.key, name: ir.project.name };
  }
  const projectId = existingProject?.id;

  // --- Milestones -----------------------------------------------------------
  const milestoneInputs = ir.milestones ?? [];
  const existingMilestoneNames = new Set<string>();
  if (projectId && milestoneInputs.length > 0) {
    const rows = await db
      .select({ name: milestonesTable.name })
      .from(milestonesTable)
      .where(
        and(
          eq(milestonesTable.workspaceId, workspaceId),
          eq(milestonesTable.projectId, projectId),
        ),
      );
    for (const r of rows) existingMilestoneNames.add(r.name.toLowerCase());
  }
  for (const m of milestoneInputs) {
    if (existingMilestoneNames.has(m.name.toLowerCase())) {
      diff.skips.push({
        kind: "milestone",
        key: m.name,
        reason: "Milestone with this name already exists in the project.",
      });
    } else {
      diff.creates.milestones.push({ name: m.name, targetDate: m.targetDate ?? null });
    }
  }

  // --- Existing task keys (for skip + dependency resolution) ---------------
  const planTaskKeys = ir.tasks.map((t) => t.key).filter((k): k is string => Boolean(k));
  const existingTaskKeys = new Set<string>();
  if (projectId && planTaskKeys.length > 0) {
    const rows = await db
      .select({ key: tasksTable.key })
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.workspaceId, workspaceId),
          eq(tasksTable.projectId, projectId),
          inArray(tasksTable.key, planTaskKeys),
        ),
      );
    for (const r of rows) existingTaskKeys.add(r.key);
  }

  // --- Tasks ---------------------------------------------------------------
  const taskLabelNamesSeen = new Set<string>();
  for (const t of ir.tasks) {
    if (t.key && existingTaskKeys.has(t.key)) {
      diff.skips.push({
        kind: "task",
        key: t.key,
        reason: "Task with this key already exists; skipped per collision policy.",
      });
      continue;
    }
    diff.creates.tasks.push({
      key: t.key,
      title: t.title,
      ...(t.milestone ? { milestone: t.milestone } : {}),
    });
    for (const s of t.subtasks ?? []) {
      diff.creates.subtasks.push({
        taskKey: t.key,
        taskTitle: t.title,
        title: s.title,
      });
    }
    for (const tag of t.tags ?? []) taskLabelNamesSeen.add(tag);
    for (const dep of t.dependsOn ?? []) {
      // Resolve targets at commit time; here just describe intent.
      const target = dep;
      const isExisting = existingTaskKeys.has(dep);
      const isInPlan = planTaskKeys.includes(dep);
      if (!isExisting && !isInPlan) {
        diagnostics.push({
          level: "warn",
          code: "import/unresolved-dependency",
          message: `Task ${t.key ?? t.title} depends on '${dep}' which is not in the plan or workspace.`,
        });
        continue;
      }
      diff.creates.taskLinks.push({
        from: t.key ?? t.title,
        to: target,
        type: "blocks",
      });
    }
  }

  // --- Labels --------------------------------------------------------------
  // Project-level tags + task-level tags collapse into the same workspace label set.
  const allLabelNames = new Set<string>([
    ...(ir.project.tags ?? []),
    ...taskLabelNamesSeen,
  ]);
  if (allLabelNames.size > 0) {
    const rows = await db
      .select({ name: labelsTable.name })
      .from(labelsTable)
      .where(eq(labelsTable.workspaceId, workspaceId));
    const existingLabelNames = new Set(rows.map((r) => r.name.toLowerCase()));
    for (const name of allLabelNames) {
      if (existingLabelNames.has(name.toLowerCase())) {
        diff.skips.push({
          kind: "label",
          key: name,
          reason: "Label exists; will be reused.",
        });
      } else {
        diff.creates.labels.push({ name });
      }
    }
  }

  return { diff, diagnostics };
}

function emptyDiff(): ImportDiff {
  return {
    creates: {
      project: null,
      milestones: [],
      tasks: [],
      subtasks: [],
      labels: [],
      taskLinks: [],
    },
    skips: [],
    conflicts: [],
  };
}
