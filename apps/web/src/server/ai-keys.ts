// Per-workspace AI key store (ADR 0002 §4). Keys are encrypted at rest with
// AES-256-GCM; this module is the only place that reads/writes the
// `workspace_ai_keys` row. Every helper takes a `Database` already scoped by
// `withActiveWorkspace` (RLS) — the caller owns the workspace context, mirroring
// the GitHub connection helpers. Plaintext is decrypted only here, at call time,
// and only `last4` is ever returned for display.
import { and, eq } from "drizzle-orm";
import { workspaceAiKeys, type Database } from "@manager/db";
import { decryptSecret, encryptSecret } from "@/src/lib/ai/crypto";

const PROVIDER = "anthropic";

/** Last 4 chars of the raw key — the only fragment safe to display. */
function lastFour(apiKey: string): string {
  return apiKey.slice(-4);
}

/**
 * Decrypt and return the workspace's stored key, or null when none is set.
 * The result is a live bearer credential — pass it straight to the AIService
 * and never log it or return it to the client.
 */
export async function getDecryptedKey(
  db: Database,
  workspaceId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ ciphertext: workspaceAiKeys.ciphertext })
    .from(workspaceAiKeys)
    .where(
      and(eq(workspaceAiKeys.workspaceId, workspaceId), eq(workspaceAiKeys.provider, PROVIDER)),
    )
    .limit(1);
  if (!row) return null;
  return decryptSecret(row.ciphertext);
}

/** Display-only metadata: whether a key exists and its last 4 chars. */
export async function getKeyMeta(
  db: Database,
  workspaceId: string,
): Promise<{ last4: string } | null> {
  const [row] = await db
    .select({ last4: workspaceAiKeys.last4 })
    .from(workspaceAiKeys)
    .where(
      and(eq(workspaceAiKeys.workspaceId, workspaceId), eq(workspaceAiKeys.provider, PROVIDER)),
    )
    .limit(1);
  return row ? { last4: row.last4 } : null;
}

/** True when the workspace has a key set (no decryption). */
export async function hasKey(db: Database, workspaceId: string): Promise<boolean> {
  return (await getKeyMeta(db, workspaceId)) !== null;
}

export interface SetKeyInput {
  workspaceId: string;
  apiKey: string;
  createdBy: string;
}

/**
 * Encrypt and upsert the workspace's key. The unique (workspace_id, provider)
 * constraint makes this an upsert — rotating a key overwrites the row and
 * refreshes `last4`/`updatedAt`. The plaintext exists only as the `apiKey`
 * argument and is dropped after encryption.
 */
export async function setKey(db: Database, input: SetKeyInput): Promise<void> {
  const ciphertext = encryptSecret(input.apiKey);
  const last4 = lastFour(input.apiKey);
  await db
    .insert(workspaceAiKeys)
    .values({
      workspaceId: input.workspaceId,
      provider: PROVIDER,
      ciphertext,
      last4,
      createdBy: input.createdBy,
    })
    .onConflictDoUpdate({
      target: [workspaceAiKeys.workspaceId, workspaceAiKeys.provider],
      set: {
        ciphertext,
        last4,
        createdBy: input.createdBy,
        keyVersion: 1,
        updatedAt: new Date(),
      },
    });
}

/** Remove the workspace's key. Idempotent — a no-op when none is set. */
export async function removeKey(db: Database, workspaceId: string): Promise<void> {
  await db
    .delete(workspaceAiKeys)
    .where(
      and(eq(workspaceAiKeys.workspaceId, workspaceId), eq(workspaceAiKeys.provider, PROVIDER)),
    );
}
