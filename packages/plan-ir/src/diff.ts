import type { PlanIR, Task } from "./ir.js";

/**
 * Current-state snapshot the importer needs to compute a dry-run diff.
 * Kept intentionally small for v1; the backend can extend it as new
 * fields land.
 */
export interface WorkspaceState {
  /** Project keys that already exist in the workspace. */
  projectKeys: ReadonlySet<string>;
  /** Task keys that already exist, scoped to their project. */
  taskKeys: ReadonlySet<string>;
  /** Milestone names that already exist, scoped per project. */
  milestoneNames: ReadonlySet<string>;
}

export interface PlanDiff {
  creates: Task[];
  updates: Task[];
  /** Tasks the importer would skip per the locked "skip + report" collision policy (decisions §7). */
  skips: Array<{ task: Task; reason: string }>;
  conflicts: Array<{ task: Task; reason: string }>;
}

/**
 * Compute a dry-run diff for an IR against the current workspace state.
 *
 * TODO(backend): this is a stub. The real implementation needs to consult
 * the DB through the import service (transactional, RLS-safe) and resolve
 * milestone/assignee references. For now we report every task as a create
 * so the frontend can wire its preview UI against the shape.
 */
export function diffAgainstWorkspace(
  ir: PlanIR,
  _currentState?: WorkspaceState,
): PlanDiff {
  return {
    creates: ir.tasks,
    updates: [],
    skips: [],
    conflicts: [],
  };
}
