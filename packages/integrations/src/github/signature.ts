// HMAC verification for inbound GitHub webhooks. Node built-ins only.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Verify a GitHub webhook signature.
 *
 * GitHub sends `x-hub-signature-256: sha256=<hex>` where `<hex>` is the
 * HMAC-SHA256 of the *raw* request body keyed by the per-connection secret.
 * The caller MUST pass the raw body string (req.text()), NOT a re-serialized
 * JSON object — re-serialization changes bytes and breaks the HMAC.
 *
 * Returns false on any shape mismatch (missing/garbled header, wrong length,
 * etc.) and never throws, so the route can treat "false" as "reject".
 */
export function verifySignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) return false;

  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

  // timingSafeEqual throws if the buffers differ in length, so guard first.
  // Comparing length is not itself a secret leak (it's a fixed-length digest).
  const a = Buffer.from(signatureHeader, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;

  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Generate a webhook signing secret: 32 random bytes, hex-encoded (64 chars).
 * Stored on the connection and shown to the user once at connect time.
 */
export function generateWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}
