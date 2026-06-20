import { and, desc, eq } from "drizzle-orm";
import { documents, users, type Database, type Document } from "@manager/db";

/**
 * Documents (wiki) service. All callers MUST run inside `withActiveWorkspace`
 * so the `app.workspace_id` GUC is set and RLS scopes every query. The
 * `workspaceId` argument is also applied as a belt-and-suspenders WHERE clause.
 */

export interface DocumentListItem {
  id: string;
  title: string;
  updatedAt: Date;
  updatedByName: string | null;
  updatedByEmail: string | null;
}

export async function listDocuments(
  db: Database,
  workspaceId: string,
): Promise<DocumentListItem[]> {
  return db
    .select({
      id: documents.id,
      title: documents.title,
      updatedAt: documents.updatedAt,
      updatedByName: users.name,
      updatedByEmail: users.email,
    })
    .from(documents)
    .leftJoin(users, eq(users.id, documents.updatedBy))
    .where(eq(documents.workspaceId, workspaceId))
    .orderBy(desc(documents.updatedAt));
}

export async function getDocument(
  db: Database,
  workspaceId: string,
  id: string,
): Promise<Document | undefined> {
  const [row] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.workspaceId, workspaceId), eq(documents.id, id)))
    .limit(1);
  return row;
}

export interface CreateDocumentInput {
  workspaceId: string;
  title: string;
  body?: string;
  userId: string;
}

export async function createDocument(
  db: Database,
  input: CreateDocumentInput,
): Promise<Document> {
  const [row] = await db
    .insert(documents)
    .values({
      workspaceId: input.workspaceId,
      title: input.title,
      body: input.body ?? "",
      createdBy: input.userId,
      updatedBy: input.userId,
    })
    .returning();
  if (!row) throw new Error("document_insert_failed");
  return row;
}

export interface UpdateDocumentInput {
  title?: string;
  body?: string;
  userId: string;
}

export async function updateDocument(
  db: Database,
  workspaceId: string,
  id: string,
  input: UpdateDocumentInput,
): Promise<Document | undefined> {
  const patch: Partial<typeof documents.$inferInsert> = {
    updatedBy: input.userId,
    updatedAt: new Date(),
  };
  if (input.title !== undefined) patch.title = input.title;
  if (input.body !== undefined) patch.body = input.body;

  const [row] = await db
    .update(documents)
    .set(patch)
    .where(and(eq(documents.workspaceId, workspaceId), eq(documents.id, id)))
    .returning();
  return row;
}

export async function deleteDocument(
  db: Database,
  workspaceId: string,
  id: string,
): Promise<void> {
  await db
    .delete(documents)
    .where(and(eq(documents.workspaceId, workspaceId), eq(documents.id, id)));
}
