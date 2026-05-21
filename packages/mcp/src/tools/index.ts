import type { ToolDefinition } from "./types.js";
import { listProjects } from "./list_projects.js";
import { getProject } from "./get_project.js";
import { listTasks } from "./list_tasks.js";
import { getTask } from "./get_task.js";
import { listMilestones } from "./list_milestones.js";
import { getMilestoneProgress } from "./get_milestone_progress.js";
import { createTask } from "./create_task.js";
import { updateTaskStatus } from "./update_task_status.js";
import { importPlan } from "./import_plan.js";

/**
 * Ordered tool registry. The order is the order Claude Desktop shows tools
 * in the picker, so the read tools come first.
 */
export const tools: ToolDefinition[] = [
  listProjects,
  getProject,
  listTasks,
  getTask,
  listMilestones,
  getMilestoneProgress,
  createTask,
  updateTaskStatus,
  importPlan,
];

export type { ToolDefinition } from "./types.js";
export { defineTool } from "./types.js";
