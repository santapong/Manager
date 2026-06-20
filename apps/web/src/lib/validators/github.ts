import { z } from "zod";

// GitHub owner/repo segments: alphanumerics plus . _ - (GitHub's own rule).
const SEGMENT_RE = /^[A-Za-z0-9._-]+$/;

/**
 * Normalize a free-form repo reference to `{ owner, repo }`. Accepts:
 *   - "owner/name"
 *   - a full GitHub URL ("https://github.com/owner/name", optional .git / trailing path)
 *   - (when both owner & repo fields are supplied separately, they pass through)
 *
 * Returns null when it can't confidently extract exactly two segments.
 */
function parseRepoRef(input: string): { owner: string; repo: string } | null {
  let value = input.trim();
  if (!value) return null;

  // Strip a URL prefix if present (github.com/..., git@github.com:..., ssh, etc.).
  // We only care about the "owner/repo" tail.
  const urlMatch = value.match(/github\.com[/:]+(.+)$/i);
  if (urlMatch?.[1]) value = urlMatch[1];

  // Drop a trailing ".git", any query/hash, and any extra path after owner/repo.
  value = value.replace(/\.git$/i, "").replace(/[?#].*$/, "");

  const parts = value.split("/").filter(Boolean);
  if (parts.length < 2) return null;

  const owner = parts[0]!;
  const repo = parts[1]!;
  if (!SEGMENT_RE.test(owner) || !SEGMENT_RE.test(repo)) return null;

  return { owner, repo };
}

/**
 * Connect-repo input. The UI sends a single `repo` field (either "owner/name"
 * or a URL); separate `owner`/`repo` are also accepted for API parity. We
 * preprocess into a `{ owner, repo }` raw shape, then validate each segment.
 */
export const ConnectRepoSchema = z.preprocess(
  (raw) => {
    if (typeof raw !== "object" || raw === null) return raw;
    const obj = raw as Record<string, unknown>;
    const owner = typeof obj.owner === "string" ? obj.owner.trim() : "";
    const repo = typeof obj.repo === "string" ? obj.repo.trim() : "";

    // If both explicit segments are present (and owner isn't itself a path),
    // keep them. Otherwise parse the `repo` field as a combined ref.
    if (owner && repo && !owner.includes("/")) {
      return { owner, repo };
    }
    const parsed = parseRepoRef(repo || owner);
    return parsed ?? { owner: "", repo: "" };
  },
  z.object({
    owner: z
      .string()
      .min(1, "Enter a repository as owner/name")
      .regex(SEGMENT_RE, "Invalid repository owner"),
    repo: z
      .string()
      .min(1, "Enter a repository as owner/name")
      .regex(SEGMENT_RE, "Invalid repository name"),
  }),
);

export type ConnectRepoInput = z.infer<typeof ConnectRepoSchema>;

export const ConnectionIdSchema = z.object({
  id: z.string().uuid(),
});

export type ConnectionIdInput = z.infer<typeof ConnectionIdSchema>;
