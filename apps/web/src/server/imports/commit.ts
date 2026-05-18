import { and, eq, inArray, sql } from "drizzle-orm";
import {
  labels as labelsTable,
  lists as listsTable,
  milestones as milestonesTable,
  projectLabels as projectLabelsTable,
  projects as projectsTable,
  subtasks as subtasksTable,
  taskLabels as taskLabelsTable,
  taskLinks as taskLinksTable,
  tasks as tasksTable,
  type Database,
} from "@manager/db";
import { wouldCreateCycle } from "@manager/db/queries";
import { PlanIRSchema, type Diagnostic, type PlanIR } from "@manager/plan-ir";
import type { CommitResult } from "./types";

export interface CommitOptions {
  /** Required: the user creating the import (used for `created_by` columns). */
  userId: string;
}

/**
 * Commit a PlanIR into the workspace.
 *
 * Caller MUST already be inside `withActiveWorkspace`, so `db` is a
 * transaction-scoped client with the workspace GUC set. All inserts here
 * therefore live in one transaction — partial commits cannot leak.
 *
 * Collision policy: SKIP. Existing projects/tasks/milestones/labels (by key
 * or case-insensitive name) are reused (when applicable) or skipped (when
 * conflicting), never updated.
 */
export async function commit(
  db: Database,
  workspaceId: string,
  ir: PlanIR,
  opts: CommitOptions,
): Promise<CommitResult> {
  const parsed = PlanIRSchema.safeParse(ir);
  if (!parsed.success) {
    throw new Error(
      `commit: invalid PlanIR — ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
  }

  const diagnostics: Diagnostic[] = [];
  const skipped: Array<{ kind: string; key: string; reason: string }> = [];
  const createdIds: CommitResult["createdIds"] = {
    milestoneIds: [],
    taskIds: [],
    subtaskIds: [],
    labelIds: [],
    taskLinkIds: [],
  };

  // --- Upsert project (skip-create only — never mutate existing) -----------
  let projectId: string;
  let projectKey: string;
  let defaultListId: string;
  const [existingProject] = await db
    .select({ id: projectsTable.id, key: projectsTable.key })
    .from(projectsTable)
    .where(and(eq(projectsTable.workspaceId, workspaceId), eq(projectsTable.key, ir.project.key)))
    .limit(1);

  if (existingProject) {
    projectId = existingProject.id;
    projectKey = existingProject.key;
    skipped.push({
      kind: "project",
      key: ir.project.key,
      reason: "project_exists_reused",
    });
    const [existingList] = await db
      .select({ id: listsTable.id })
      .from(listsTable)
      .where(eq(listsTable.projectId, projectId))
      .orderBy(listsTable.position)
      .limit(1);
    if (!existingList) {
      const [newList] = await db
        .insert(listsTable)
        .values({ workspaceId, projectId, name: "Backlog", position: 0 })
        .returning();
      if (!newList) throw new Error("commit: default list insert failed");
      defaultListId = newList.id;
    } else {
      defaultListId = existingList.id;
    }
  } else {
    const [newProject] = await db
      .insert(projectsTable)
      .values({
        workspaceId,
        key: ir.project.key,
        name: ir.project.name,
        startDate: ir.project.startDate ?? null,
        targetDate: ir.project.targetDate ?? null,
        createdBy: opts.userId,
      })
      .returning();
    if (!newProject) throw new Error("commit: project insert failed");
    projectId = newProject.id;
    projectKey = newProject.key;
    createdIds.projectId = newProject.id;

    const [newList] = await db
      .insert(listsTable)
      .values({ workspaceId, projectId, name: "Backlog", position: 0 })
      .returning();
    if (!newList) throw new Error("commit: default list insert failed");
    defaultListId = newList.id;
  }

  // --- Labels (workspace-scoped, get-or-create by lower(name)) -------------
  const allLabelNames = new Set<string>([
    ...(ir.project.tags ?? []),
    ...ir.tasks.flatMap((t) => t.tags ?? []),
  ]);
  const labelIdByLowerName = new Map<string, string>();
  if (allLabelNames.size > 0) {
    const existingLabels = await db
      .select({ id: labelsTable.id, name: labelsTable.name })
      .from(labelsTable)
      .where(eq(labelsTable.workspaceId, workspaceId));
    for (const r of existingLabels) {
      labelIdByLowerName.set(r.name.toLowerCase(), r.id);
    }
    for (const name of allLabelNames) {
      if (labelIdByLowerName.has(name.toLowerCase())) {
        skipped.push({ kind: "label", key: name, reason: "label_exists_reused" });
        continue;
      }
      const [row] = await db
        .insert(labelsTable)
        .values({ workspaceId, name })
        .returning();
      if (!row) throw new Error("commit: label insert failed");
      labelIdByLowerName.set(name.toLowerCase(), row.id);
      createdIds.labelIds.push(row.id);
    }
  }

  // Attach project tags.
  for (const tag of ir.project.tags ?? []) {
    const labelId = labelIdByLowerName.get(tag.toLowerCase());
    if (!labelId) continue;
    await db
      .insert(projectLabelsTable)
      .values({ projectId, labelId })
      .onConflictDoNothing();
  }

  // --- Milestones ----------------------------------------------------------
  const milestoneIdByName = new Map<string, string>();
  const existingMilestones = await db
    .select({ id: milestonesTable.id, name: milestonesTable.name })
    .from(milestonesTable)
    .where(and(eq(milestonesTable.workspaceId, workspaceId), eq(milestonesTable.projectId, projectId)));
  for (const r of existingMilestones) {
    milestoneIdByName.set(r.name.toLowerCase(), r.id);
  }
  let msPosition = existingMilestones.length;
  for (const m of ir.milestones ?? []) {
    if (milestoneIdByName.has(m.name.toLowerCase())) {
      skipped.push({ kind: "milestone", key: m.name, reason: "milestone_exists_reused" });
      continue;
    }
    const [row] = await db
      .insert(milestonesTable)
      .values({
        workspaceId,
        projectId,
        name: m.name,
        description: m.description ?? null,
        targetDate: m.targetDate ?? null,
        status: m.status ?? "open",
        position: msPosition++,
      })
      .returning();
    if (!row) throw new Error("commit: milestone insert failed");
    milestoneIdByName.set(m.name.toLowerCase(), row.id);
    createdIds.milestoneIds.push(row.id);
  }

  // --- Tasks ---------------------------------------------------------------
  // Existing task keys in this project (for skip-on-collision and resolving
  // dependsOn that points to pre-existing tasks).
  const planTaskKeys = ir.tasks.map((t) => t.key).filter((k): k is string => Boolean(k));
  const existingTasks = planTaskKeys.length > 0
    ? await db
        .select({ id: tasksTable.id, key: tasksTable.key })
        .from(tasksTable)
        .where(
          and(
            eq(tasksTable.workspaceId, workspaceId),
            eq(tasksTable.projectId, projectId),
            inArray(tasksTable.key, planTaskKeys),
          ),
        )
    : [];
  const existingTaskKeys = new Set(existingTasks.map((t) => t.key));
  const taskIdByKey = new Map<string, string>(existingTasks.map((t) => [t.key, t.id] as const));

  // Lock the project row for nextTaskSeq allocation.
  const [projectRow] = await db
    .select({ nextTaskSeq: projectsTable.nextTaskSeq })
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId))
    .for("update")
    .limit(1);
  if (!projectRow) throw new Error("commit: project disappeared during commit");
  let nextSeq = projectRow.nextTaskSeq;

  // Map IR-supplied keys to a tracked key per inserted task so the dependsOn
  // resolution stage can find them by either user-provided key or generated key.
  const taskIdByPlanRef = new Map<string, string>(taskIdByKey);

  for (const t of ir.tasks) {
    if (t.key && existingTaskKeys.has(t.key)) {
      skipped.push({
        kind: "task",
        key: t.key,
        reason: "task_key_collision_skipped",
      });
      continue;
    }
    const assignedKey = t.key ?? `${projectKey}-${nextSeq}`;
    if (!t.key) {
      nextSeq += 1;
    } else {
      // If the user gave a key like PROJ-12, advance nextSeq past it to
      // avoid future auto-allocations colliding.
      const m = /^([A-Z][A-Z0-9]*)-(\d+)$/u.exec(t.key);
      if (m && m[1] === projectKey) {
        const n = Number.parseInt(m[2]!, 10);
        if (n >= nextSeq) nextSeq = n + 1;
      }
    }
    const milestoneId = t.milestone
      ? milestoneIdByName.get(t.milestone.toLowerCase()) ?? null
      : null;
    if (t.milestone && !milestoneId) {
      diagnostics.push({
        level: "warn",
        code: "import/unknown-milestone",
        message: `Task ${assignedKey} references milestone '${t.milestone}' which was not found; created without a milestone.`,
      });
    }
    const [row] = await db
      .insert(tasksTable)
      .values({
        workspaceId,
        projectId,
        listId: defaultListId,
        milestoneId,
        key: assignedKey,
        title: t.title,
        description: t.description ?? null,
        status: mapIrStatus(t.status),
        priority: t.priority ?? "medium",
        type: t.type ?? "task",
        position: nextSeq,
        createdBy: opts.userId,
      })
      .returning();
    if (!row) throw new Error("commit: task insert failed");
    createdIds.taskIds.push(row.id);
    taskIdByKey.set(assignedKey, row.id);
    taskIdByPlanRef.set(assignedKey, row.id);
    if (t.key) taskIdByPlanRef.set(t.key, row.id);

    // Attach labels for this task.
    for (const tag of t.tags ?? []) {
      const labelId = labelIdByLowerName.get(tag.toLowerCase());
      if (!labelId) continue;
      await db
        .insert(taskLabelsTable)
        .values({ taskId: row.id, labelId })
        .onConflictDoNothing();
    }

    // Subtasks.
    let subPos = 0;
    for (const s of t.subtasks ?? []) {
      const [subRow] = await db
        .insert(subtasksTable)
        .values({
          workspaceId,
          taskId: row.id,
          title: s.title,
          done: s.done,
          position: subPos++,
        })
        .returning();
      if (!subRow) throw new Error("commit: subtask insert failed");
      createdIds.subtaskIds.push(subRow.id);
    }
  }

  // Persist the advanced nextTaskSeq.
  await db
    .update(projectsTable)
    .set({ nextTaskSeq: nextSeq, updatedAt: new Date() })
    .where(eq(projectsTable.id, projectId));

  // --- Task links (dependsOn -> blocks) ------------------------------------
  // Edge: `dep` "blocks" `task` — i.e. dep must finish before task can start.
  for (const t of ir.tasks) {
    const toId = t.key ? taskIdByPlanRef.get(t.key) : undefined;
    if (!toId) continue; // task was skipped
    for (const dep of t.dependsOn ?? []) {
      const fromId = taskIdByPlanRef.get(dep);
      if (!fromId) {
        diagnostics.push({
          level: "warn",
          code: "import/unresolved-dependency",
          message: `Task ${t.key} depends on '${dep}' which could not be resolved; link skipped.`,
        });
        continue;
      }
      if (fromId === toId) continue;
      const cycle = await wouldCreateCycle(db, fromId, toId, "task_blocks");
      if (cycle) {
        diagnostics.push({
          level: "error",
          code: "import/cycle-detected",
          message: `Adding dependency ${dep} -> ${t.key} would create a cycle; link skipped.`,
        });
        skipped.push({ kind: "link", key: `${dep}->${t.key}`, reason: "would_create_cycle" });
        continue;
      }
      const [linkRow] = await db
        .insert(taskLinksTable)
        .values({
          workspaceId,
          fromTaskId: fromId,
          toTaskId: toId,
          type: "blocks",
        })
        .onConflictDoNothing()
        .returning();
      if (linkRow) createdIds.taskLinkIds.push(linkRow.id);
    }
  }

  // Reference unused-but-imported symbol so tree-shaking doesn't drop it.
  void sql;

  return { createdIds, diagnostics, skipped };
}

/**
 * Map plan-ir task statuses (which mirror the planning vocabulary)
 * onto the DB's narrower status enum (`open` | `in_progress` | `done`).
 */
function mapIrStatus(
  status: PlanIR["tasks"][number]["status"],
): "open" | "in_progress" | "done" {
  switch (status) {
    case undefined:
    case "backlog":
    case "todo":
    case "blocked":
      return "open";
    case "in_progress":
    case "in_review":
      return "in_progress";
    case "done":
    case "cancelled":
      return "done";
    default:
      return "open";
  }
}
