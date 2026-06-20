// Pure parsing of GitHub `pull_request` webhook payloads into a normalized
// shape, plus the action→task-status mapping. Defensive throughout: a malformed
// or partial payload yields null rather than throwing — the webhook handler
// must never crash on attacker-controlled input.

/** Task status values the app understands. Mirrors `tasks.status` in the DB. */
export type TaskStatus = "open" | "in_progress" | "done";

/** Normalized PR event, decoupled from GitHub's wire format. */
export interface ParsedPR {
  action: string;
  number: number;
  title: string | null;
  body: string | null;
  /** head.ref — the source branch name. */
  branch: string | null;
  /** pull_request.html_url — canonical link we store + dedupe on. */
  htmlUrl: string;
  merged: boolean;
  /** open | closed (GitHub's pull_request.state). */
  state: string | null;
  /** pull_request.user.login */
  author: string | null;
  /** repository.owner.login */
  repoOwner: string;
  /** repository.name */
  repoName: string;
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * Parse a `pull_request` webhook body. Returns null when any field we need to
 * act on is missing or the wrong type (no number, no html_url, no repo coords).
 * We never trust client-supplied numbers as floats — `number` must be an
 * integer or we bail.
 */
export function parsePullRequestEvent(payload: unknown): ParsedPR | null {
  if (!isRecord(payload)) return null;

  const action = asString(payload.action);
  const pr = payload.pull_request;
  const repository = payload.repository;
  if (!action || !isRecord(pr) || !isRecord(repository)) return null;

  // PR number lives at the top level of the event, with pull_request.number as
  // a fallback. Must be a finite integer.
  const rawNumber =
    typeof payload.number === "number"
      ? payload.number
      : typeof pr.number === "number"
        ? pr.number
        : NaN;
  if (!Number.isInteger(rawNumber)) return null;

  const htmlUrl = asString(pr.html_url);
  if (!htmlUrl) return null;

  const owner = isRecord(repository.owner) ? asString(repository.owner.login) : null;
  const repoName = asString(repository.name);
  if (!owner || !repoName) return null;

  const head = isRecord(pr.head) ? pr.head : null;
  const user = isRecord(pr.user) ? pr.user : null;

  return {
    action,
    number: rawNumber,
    title: asString(pr.title),
    body: asString(pr.body),
    branch: head ? asString(head.ref) : null,
    htmlUrl,
    merged: pr.merged === true,
    state: asString(pr.state),
    author: user ? asString(user.login) : null,
    repoOwner: owner,
    repoName,
  };
}

/** Actions that mean "there is active work on this PR" → in_progress. */
const IN_PROGRESS_ACTIONS = new Set([
  "opened",
  "reopened",
  "ready_for_review",
  "synchronize",
]);

/**
 * Map a PR event to the task status it should drive, or null to leave the task
 * untouched. A merged PR always wins → done (we don't want a stray `closed`
 * action to demote a merged task). Otherwise only the "work in progress"
 * actions move the task; everything else (e.g. plain `closed` without merge,
 * `labeled`, `edited`, draft `converted_to_draft`) is a no-op so we never
 * regress a manually-set status from a non-meaningful event.
 */
export function mapPrToStatus(pr: ParsedPR): TaskStatus | null {
  if (pr.merged) return "done";
  if (IN_PROGRESS_ACTIONS.has(pr.action)) return "in_progress";
  return null;
}
