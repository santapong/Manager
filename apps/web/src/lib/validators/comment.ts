import { z } from "zod";

export const CreateCommentSchema = z.object({
  taskId: z.string().uuid(),
  body: z.string().min(1, "Comment can't be empty").max(10_000),
});

export const DeleteCommentSchema = z.object({
  id: z.string().uuid(),
});
