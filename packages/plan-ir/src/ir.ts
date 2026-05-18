import { z } from "zod";

/**
 * Canonical Plan IR.
 *
 * `planFormat` is a numeric version. Bump this whenever the schema makes
 * a backwards-incompatible change so importers can refuse old payloads
 * with a clear error rather than silently misinterpreting them.
 *
 * See `docs/plans/decisions.md` §1 for the locked Markdown convention
 * that maps into this shape.
 */
export const PLAN_FORMAT_VERSION = 1 as const;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "Expected YYYY-MM-DD date string");

export const TaskStatusSchema = z.enum([
  "backlog",
  "todo",
  "in_progress",
  "blocked",
  "in_review",
  "done",
  "cancelled",
]);

export const TaskPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);

export const TaskTypeSchema = z.enum(["task", "story", "bug", "epic"]);

export const MilestoneStatusSchema = z.enum(["open", "closed"]);

export const SubtaskSchema = z.object({
  title: z.string().min(1),
  done: z.boolean().default(false),
});
export type Subtask = z.infer<typeof SubtaskSchema>;

export const TaskSchema = z.object({
  /** Optional human-stable key, e.g. `PROJ-12`. */
  key: z.string().min(1).optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  status: TaskStatusSchema.optional(),
  priority: TaskPrioritySchema.optional(),
  type: TaskTypeSchema.optional(),
  tags: z.array(z.string().min(1)).optional(),
  /** Other task keys this task depends on (advisory; cycle detection happens at import time). */
  dependsOn: z.array(z.string().min(1)).optional(),
  /** Milestone name; resolved by the importer to a milestone id. */
  milestone: z.string().min(1).optional(),
  /** Email or workspace user id; the importer resolves this to a membership. */
  assignee: z.string().min(1).optional(),
  subtasks: z.array(SubtaskSchema).optional(),
});
export type Task = z.infer<typeof TaskSchema>;

export const MilestoneSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  targetDate: isoDate.optional(),
  status: MilestoneStatusSchema.optional(),
});
export type Milestone = z.infer<typeof MilestoneSchema>;

export const ProjectSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  targetDate: isoDate.optional(),
  startDate: isoDate.optional(),
  tags: z.array(z.string().min(1)).optional(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const PlanIRSchema = z.object({
  planFormat: z.literal(PLAN_FORMAT_VERSION),
  project: ProjectSchema,
  milestones: z.array(MilestoneSchema).optional(),
  tasks: z.array(TaskSchema),
});
export type PlanIR = z.infer<typeof PlanIRSchema>;

export const DiagnosticLevelSchema = z.enum(["error", "warn", "info"]);
export type DiagnosticLevel = z.infer<typeof DiagnosticLevelSchema>;

export const DiagnosticSchema = z.object({
  level: DiagnosticLevelSchema,
  message: z.string(),
  line: z.number().int().nonnegative().optional(),
  column: z.number().int().nonnegative().optional(),
  code: z.string().optional(),
});
export type Diagnostic = z.infer<typeof DiagnosticSchema>;

export interface ParseResult {
  ir: PlanIR;
  diagnostics: Diagnostic[];
}
