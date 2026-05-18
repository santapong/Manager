import { z } from "zod";

export const MilestoneStatusEnum = z.enum(["open", "closed"]);
export type MilestoneStatus = z.infer<typeof MilestoneStatusEnum>;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "Expected YYYY-MM-DD date string");

export const CreateMilestoneSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(10_000).optional().nullable(),
  targetDate: isoDate.optional().nullable(),
  status: MilestoneStatusEnum.optional(),
  position: z.number().int().nonnegative().optional(),
});

export const UpdateMilestoneSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(10_000).optional().nullable(),
  targetDate: isoDate.optional().nullable(),
  status: MilestoneStatusEnum.optional(),
  position: z.number().int().nonnegative().optional(),
});

export const SetMilestoneStatusSchema = z.object({
  id: z.string().uuid(),
  status: MilestoneStatusEnum,
});

export const MilestoneIdSchema = z.object({
  id: z.string().uuid(),
});

export const ListMilestonesSchema = z.object({
  projectId: z.string().uuid(),
});
