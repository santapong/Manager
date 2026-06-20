import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@manager/observability";
import { dbNode } from "@manager/db";
import { parsePullRequestEvent, verifySignature } from "@manager/integrations";
import { env } from "@/src/env";
import {
  applyPullRequestToWorkspace,
  findConnectionsByRepo,
} from "@/src/server/github";

// HMAC verification needs Node's crypto, and we must read the raw request body
// (not req.json()) to compute the digest — so pin the Node runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = logger.child({ route: "webhooks/github" });

function pickString(obj: unknown, ...path: string[]): string | null {
  let cur: unknown = obj;
  for (const key of path) {
    if (typeof cur !== "object" || cur === null) return null;
    cur = (cur as Record<string, unknown>)[key];
  }
  return typeof cur === "string" ? cur : null;
}

/**
 * POST /api/webhooks/github
 *
 * Inbound, HMAC-verified GitHub webhook. Resolves the connection(s) by
 * repository (owner/repo), verifies `x-hub-signature-256` against each
 * connection's per-tenant secret with a timing-safe compare, and applies
 * `pull_request` events to the matching workspaces (link PRs to tasks by key,
 * drive task status). No GitHub API calls, no stored access token.
 */
export async function POST(req: NextRequest) {
  try {
    // Raw body FIRST — the HMAC is over these exact bytes. Calling req.json()
    // here would consume the stream and (after re-serialization) change them.
    const raw = await req.text();
    const event = req.headers.get("x-github-event");
    const signature = req.headers.get("x-hub-signature-256");

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const owner = pickString(payload, "repository", "owner", "login");
    const repo = pickString(payload, "repository", "name");
    if (!owner || !repo) {
      return NextResponse.json({ error: "missing_repository" }, { status: 400 });
    }

    const db = dbNode(env.DATABASE_URL);
    const connections = await findConnectionsByRepo(db, owner, repo);
    if (connections.length === 0) {
      // Repo isn't connected to any workspace here. Acknowledge so GitHub
      // doesn't retry, but signal we did nothing.
      return NextResponse.json({ ignored: true }, { status: 202 });
    }

    // Keep only connections whose secret verifies this exact body. An attacker
    // who knows the repo name but not the secret gets zero verified rows.
    const verified = connections.filter((c) => verifySignature(raw, signature, c.webhookSecret));

    if (verified.length === 0) {
      log.warn("github webhook signature mismatch", { owner, repo, event });
      return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
    }

    if (event === "ping") {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    if (event === "pull_request") {
      const pr = parsePullRequestEvent(payload);
      if (!pr) {
        // Verified sender, but a shape we can't act on — acknowledge, do nothing.
        return NextResponse.json({ ok: true, applied: 0 }, { status: 200 });
      }

      let linked = 0;
      let statusUpdated = 0;
      for (const conn of verified) {
        const res = await applyPullRequestToWorkspace(db, conn.workspaceId, pr);
        linked += res.linked;
        statusUpdated += res.statusUpdated;
      }
      log.info("github pull_request applied", {
        owner,
        repo,
        action: pr.action,
        number: pr.number,
        workspaces: verified.length,
        linked,
        statusUpdated,
      });
      return NextResponse.json(
        { ok: true, workspaces: verified.length, linked, statusUpdated },
        { status: 200 },
      );
    }

    // Verified but an event type we don't handle (issues, push, …). Ack it.
    return NextResponse.json({ ok: true, ignored: event ?? "unknown" }, { status: 200 });
  } catch (err) {
    // Never echo the secret or internal details.
    log.error("github webhook error", { err: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
