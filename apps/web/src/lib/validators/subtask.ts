import { z } from "zod";

export const CreateSubtaskSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string().min(1).max(500),
  done: z.boolean().optional(),
  assigneeId: z.string().uuid().optional().nullable(),
  position: z.number().int().nonnegative().optional(),
});

export const UpdateSubtaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(500).optional(),
  done: z.boolean().optional(),
  assigneeId: z.string().uuid().optional().nullable(),
  position: z.number().int().nonnegative().optional(),
});

export const SubtaskIdSchema = z.object({
  id: z.string().uuid(),
});

export const ToggleSubtaskSchema = z.object({
  id: z.string().uuid(),
  done: z.boolean().optional(),
});

export const ReorderSubtasksSchema = z.object({
  taskId: z.string().uuid(),
  /** Ordered list of subtask ids in their new order. */
  orderedIds: z.array(z.string().uuid()).min(1),
});

export const ListSubtasksSchema = z.object({
  taskId: z.string().uuid(),
});
