import { z } from "zod";

export const TaskStatusEnum = z.enum(["open", "in_progress", "done"]);
export type TaskStatus = z.infer<typeof TaskStatusEnum>;

export const TaskPriorityEnum = z.enum(["low", "medium", "high", "urgent"]);
export type TaskPriority = z.infer<typeof TaskPriorityEnum>;

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
});

export const DeleteTaskSchema = z.object({
  id: z.string().uuid(),
});

export const CreateProjectSchema = z.object({
  name: z.string().min(2).max(60),
  key: z
    .string()
    .min(2)
    .max(10)
    .regex(/^[A-Z][A-Z0-9]+$/, "Key must be UPPERCASE letters/digits, e.g. ENG"),
});
