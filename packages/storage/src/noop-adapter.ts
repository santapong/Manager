import type { BlobService } from "./types";

/**
 * Throws on every method. Wired in Phase 0 so any accidental file upload
 * code path fails loudly instead of silently dropping data. Replace
 * with the Vercel Blob (cloud) or S3/R2 (self-host) adapter when uploads
 * actually ship.
 */
export function createNoopBlobService(): BlobService {
  const fail = (op: string): never => {
    throw new Error(`@manager/storage: ${op} called but no adapter is configured`);
  };
  return {
    async putSignedUrl() {
      return fail("putSignedUrl");
    },
    async getSignedUrl() {
      return fail("getSignedUrl");
    },
    async delete() {
      return fail("delete");
    },
    async head() {
      return fail("head");
    },
  };
}
