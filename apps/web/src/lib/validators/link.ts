import { z } from "zod";

export const TaskLinkTypeEnum = z.enum(["blocks", "relates", "duplicates"]);
export type TaskLinkType = z.infer<typeof TaskLinkTypeEnum>;

export const ProjectLinkTypeEnum = z.enum(["depends_on", "relates"]);
export type ProjectLinkType = z.infer<typeof ProjectLinkTypeEnum>;

export const CreateTaskLinkSchema = z.object({
  fromTaskId: z.string().uuid(),
  toTaskId: z.string().uuid(),
  type: TaskLinkTypeEnum,
});

export const DeleteLinkSchema = z.object({
  id: z.string().uuid(),
});

export const CreateProjectLinkSchema = z.object({
  fromProjectId: z.string().uuid(),
  toProjectId: z.string().uuid(),
  type: ProjectLinkTypeEnum,
});

export const ListTaskLinksSchema = z.object({
  taskId: z.string().uuid(),
});

export const ListProjectLinksSchema = z.object({
  projectId: z.string().uuid(),
});
