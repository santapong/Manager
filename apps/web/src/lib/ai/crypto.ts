// AES-256-GCM encryption for per-workspace AI keys (BYO key, ADR 0002 §4).
// Node built-ins only — no new dependency, mirroring the GitHub webhook
// signature util's use of `node:crypto`. The master key comes from
// `AI_ENCRYPTION_KEY` (base64 of exactly 32 bytes). Plaintext keys are NEVER
// logged and never leave the server; only `last4` is ever surfaced.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/src/env";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12; // 96-bit nonce, the GCM standard
const TAG_BYTES = 16; // GCM auth tag
const VERSION = 1; // packed-format version byte, for future rotation

/** True when `AI_ENCRYPTION_KEY` is present and a valid 32-byte base64 value. */
export function aiEncryptionConfigured(): boolean {
  const raw = env.AI_ENCRYPTION_KEY;
  if (!raw) return false;
  try {
    return Buffer.from(raw, "base64").length === KEY_BYTES;
  } catch {
    return false;
  }
}

/**
 * Decode + validate the master key. Throws a clear, non-leaky error when the
 * env var is missing or the wrong length so misconfiguration fails loudly at
 * call time rather than producing undecryptable ciphertext.
 */
function masterKey(): Buffer {
  const raw = env.AI_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("AI_ENCRYPTION_KEY is not set; the AI assistant is disabled.");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `AI_ENCRYPTION_KEY must be base64 of ${KEY_BYTES} bytes (got ${key.length}).`,
    );
  }
  return key;
}

/**
 * Encrypt a secret. Returns base64 of the packed blob:
 *   version(1) ‖ iv(12) ‖ authTag(16) ‖ ciphertext(n)
 * A fresh random IV is generated per call (GCM nonce reuse is catastrophic).
 */
export function encryptSecret(plaintext: string): string {
  const key = masterKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([VERSION]), iv, tag, ciphertext]).toString("base64");
}

/**
 * Decrypt a packed blob produced by {@link encryptSecret}. Throws on a version
 * mismatch, a truncated blob, or a failed auth-tag check (tampering / wrong
 * key). Never logs the plaintext.
 */
export function decryptSecret(packed: string): string {
  const key = masterKey();
  const buf = Buffer.from(packed, "base64");
  if (buf.length < 1 + IV_BYTES + TAG_BYTES) {
    throw new Error("Encrypted AI key is malformed (too short).");
  }
  const version = buf[0];
  if (version !== VERSION) {
    throw new Error(`Unsupported AI key encryption version: ${version}.`);
  }
  const iv = buf.subarray(1, 1 + IV_BYTES);
  const tag = buf.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
  const ciphertext = buf.subarray(1 + IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
