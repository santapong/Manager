import { z } from "zod";

/**
 * Validation schemas for workspace documents (wiki). `body` is Markdown text
 * capped well below the DB `text` ceiling to keep payloads and render time sane.
 */

export const CreateDocumentSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(100_000).optional(),
});

export const UpdateDocumentSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  body: z.string().max(100_000).optional(),
});

export const DocumentIdSchema = z.object({
  id: z.string().uuid(),
});

export type CreateDocumentInput = z.infer<typeof CreateDocumentSchema>;
export type UpdateDocumentInput = z.infer<typeof UpdateDocumentSchema>;
