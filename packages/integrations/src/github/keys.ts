// Pure task-key extraction. No I/O, no @manager/db — this module is shared by
// the webhook handler and (eventually) the .mcpb / OpenAPI surfaces, so it must
// stay dependency-free.

/**
 * Task keys look like `ABC-123`: a leading letter, then letters/digits, a dash,
 * then digits. The leading char must be a letter so we don't match `1-2`.
 * `\b` anchors keep us from matching inside longer tokens (e.g. `xABC-1`).
 */
const TASK_KEY_RE = /\b[A-Z][A-Z0-9]+-\d+\b/g;

/**
 * Extract every task key from a blob of text. Matching is case-insensitive on
 * input but keys are normalized to upper-case on output, de-duplicated while
 * preserving first-seen order.
 */
export function extractTaskKeys(text: string | null | undefined): string[] {
  if (!text) return [];
  // Match against an upper-cased copy so `abc-1` and `ABC-1` collapse to one key.
  const matches = text.toUpperCase().match(TASK_KEY_RE);
  if (!matches) return [];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    if (!seen.has(m)) {
      seen.add(m);
      out.push(m);
    }
  }
  return out;
}

/**
 * Union of task keys found in a PR's title, branch name, and body. A PR can
 * reference a task in any of these places, so we look in all three and merge
 * (first-seen order across title → branch → body).
 */
export function extractKeysFromPR(input: {
  title?: string | null;
  branch?: string | null;
  body?: string | null;
}): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const source of [input.title, input.branch, input.body]) {
    for (const key of extractTaskKeys(source)) {
      if (!seen.has(key)) {
        seen.add(key);
        out.push(key);
      }
    }
  }
  return out;
}
