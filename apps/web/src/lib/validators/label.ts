import { z } from "zod";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/u, "Expected #rrggbb hex color");

export const CreateLabelSchema = z.object({
  name: z.string().min(1).max(60),
  color: hexColor.optional(),
});

export const UpdateLabelSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(60).optional(),
  color: hexColor.optional(),
});

export const LabelIdSchema = z.object({
  id: z.string().uuid(),
});

export const AttachLabelToTaskSchema = z.object({
  taskId: z.string().uuid(),
  labelId: z.string().uuid(),
});

export const AttachLabelToProjectSchema = z.object({
  projectId: z.string().uuid(),
  labelId: z.string().uuid(),
});
