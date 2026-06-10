import { z } from "zod";

export const TaskStatusEnum = z.enum(["open", "in_progress", "done"]);
export type TaskStatus = z.infer<typeof TaskStatusEnum>;

export const TaskPriorityEnum = z.enum(["low", "medium", "high", "urgent"]);
export type TaskPriority = z.infer<typeof TaskPriorityEnum>;

export const TaskTypeEnum = z.enum(["task", "story", "bug", "epic"]);
export type TaskType = z.infer<typeof TaskTypeEnum>;

// "YYYY-MM-DD" | "" | null → Date (UTC midnight) | null; undefined passes through.
const DueAtInput = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "Expected YYYY-MM-DD"), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === undefined ? undefined : v ? new Date(`${v}T00:00:00.000Z`) : null));

export const CreateTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(10_000).optional().nullable(),
});

export const UpdateTaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(10_000).optional().nullable(),
  status: TaskStatusEnum.optional(),
  priority: TaskPriorityEnum.optional(),
  type: TaskTypeEnum.optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  dueAt: DueAtInput,
  points: z.number().int().min(0).max(100).nullable().optional(),
  milestoneId: z.string().uuid().nullable().optional(),
});

export const DeleteTaskSchema = z.object({
  id: z.string().uuid(),
});

// Board drag/drop: the server computes the fractional position from the
// neighbor ids — clients never send raw positions.
export const MoveTaskSchema = z.object({
  id: z.string().uuid(),
  status: TaskStatusEnum,
  beforeId: z.string().uuid().nullable().optional(),
  afterId: z.string().uuid().nullable().optional(),
});

export const TaskSortEnum = z.enum(["position", "due", "priority", "points", "updated"]);
export const SortDirEnum = z.enum(["asc", "desc"]);

export interface ListFilters {
  status?: z.infer<typeof TaskStatusEnum>;
  priority?: z.infer<typeof TaskPriorityEnum>;
  type?: z.infer<typeof TaskTypeEnum>;
  assignee?: string; // user id or "none"
  sort?: z.infer<typeof TaskSortEnum>;
  dir?: z.infer<typeof SortDirEnum>;
}

/** Field-wise parse of list filter searchParams — invalid values drop out. */
export function parseListFilters(sp: Record<string, string | undefined>): ListFilters {
  const pick = <T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }, v?: string) => {
    if (!v) return undefined;
    const r = schema.safeParse(v);
    return r.success ? r.data : undefined;
  };
  return {
    status: pick(TaskStatusEnum, sp.status),
    priority: pick(TaskPriorityEnum, sp.priority),
    type: pick(TaskTypeEnum, sp.type),
    assignee: pick(z.union([z.literal("none"), z.string().uuid()]), sp.assignee),
    sort: pick(TaskSortEnum, sp.sort),
    dir: pick(SortDirEnum, sp.dir),
  };
}

export const CreateProjectSchema = z.object({
  name: z.string().min(2).max(60),
  key: z
    .string()
    .min(2)
    .max(10)
    .regex(/^[A-Z][A-Z0-9]+$/, "Key must be UPPERCASE letters/digits, e.g. ENG"),
});
