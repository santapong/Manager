import { z } from "zod";

export const SprintStatusEnum = z.enum(["planned", "active", "completed"]);
export type SprintStatus = z.infer<typeof SprintStatusEnum>;

// "YYYY-MM-DD" | "" | null → Date (UTC midnight) | null; undefined passes through.
// Mirrors the DueAtInput coercion in validators/task.ts so dates round-trip
// consistently through Server Actions (FormData strings) into timestamptz columns.
const DateInput = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "Expected YYYY-MM-DD"), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === undefined ? undefined : v ? new Date(`${v}T00:00:00.000Z`) : null));

export const CreateSprintSchema = z
  .object({
    projectId: z.string().uuid(),
    name: z.string().min(1).max(200),
    goal: z.string().max(2_000).optional().nullable(),
    startAt: DateInput,
    endAt: DateInput,
    status: SprintStatusEnum.optional(),
  })
  .refine(
    (v) => !(v.startAt instanceof Date && v.endAt instanceof Date) || v.endAt >= v.startAt,
    { message: "End date must be on or after the start date", path: ["endAt"] },
  );

export const UpdateSprintSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(200).optional(),
    goal: z.string().max(2_000).optional().nullable(),
    startAt: DateInput,
    endAt: DateInput,
    status: SprintStatusEnum.optional(),
  })
  .refine(
    (v) => !(v.startAt instanceof Date && v.endAt instanceof Date) || v.endAt >= v.startAt,
    { message: "End date must be on or after the start date", path: ["endAt"] },
  );

export const SprintIdSchema = z.object({
  id: z.string().uuid(),
});

// sprintId nullable: null unassigns a task back to the backlog.
export const AssignTaskSchema = z.object({
  taskId: z.string().uuid(),
  sprintId: z.string().uuid().nullable(),
});

export type CreateSprintInput = z.infer<typeof CreateSprintSchema>;
export type UpdateSprintInput = z.infer<typeof UpdateSprintSchema>;
