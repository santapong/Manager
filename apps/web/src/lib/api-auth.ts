import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { dbNode, withWorkspace, workspaces, type Database } from "@manager/db";
import { env } from "../env";

/**
 * Authentication + workspace resolution for `/api/v1/*` integration routes.
 *
 * v1 short-circuit: a single static API key from `MANAGER_API_KEY` plus a
 * `X-Workspace-Slug` header to scope the request. The real follow-up is
 * Personal Access Tokens (argon2id-hashed, per-user, per-scope). See
 * `docs/integrations/mcp.md` "Auth follow-up".
 *
 * Behaviour:
 *   - If `MANAGER_API_KEY` is unset: every v1 call → 503 `auth_not_configured`.
 *     (Refuse to silently disable auth on the integration API.)
 *   - Else require `Authorization: Bearer <key>` to match exactly.
 *   - Else require `X-Workspace-Slug: <slug>` and resolve a workspace row.
 *   - Run `fn` inside `withWorkspace(workspaceId)` so RLS scoping is set.
 *
 * NEVER use this on routes that should be session-scoped to a user.
 */

export interface ApiAuthContext {
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
}

export class ApiAuthError extends Error {
  constructor(
    public readonly code:
      | "auth_not_configured"
      | "missing_authorization"
      | "invalid_authorization"
      | "missing_workspace_slug"
      | "workspace_not_found",
    public readonly status: number,
  ) {
    super(code);
    this.name = "ApiAuthError";
  }
}

function getApiKey(): string | undefined {
  // We do NOT route through `env` because that schema is a hard fail; the
  // integrations key is intentionally optional. Read process.env directly.
  const raw = process.env["MANAGER_API_KEY"];
  if (!raw || raw.trim().length === 0) return undefined;
  return raw;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Authenticate the request and resolve the workspace from the header.
 *
 * Throws `ApiAuthError`; callers should let `withApiAuth` translate that
 * into a `NextResponse`.
 */
export async function authenticateApiRequest(req: NextRequest): Promise<ApiAuthContext> {
  const apiKey = getApiKey();
  if (!apiKey) throw new ApiAuthError("auth_not_configured", 503);

  const header = req.headers.get("authorization");
  if (!header) throw new ApiAuthError("missing_authorization", 401);
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m || !m[1]) throw new ApiAuthError("invalid_authorization", 401);
  if (!timingSafeEqual(m[1], apiKey)) throw new ApiAuthError("invalid_authorization", 401);

  const slug = req.headers.get("x-workspace-slug")?.trim();
  if (!slug) throw new ApiAuthError("missing_workspace_slug", 400);

  const db = dbNode(env.DATABASE_URL);
  const [ws] = await db
    .select({ id: workspaces.id, slug: workspaces.slug, name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.slug, slug))
    .limit(1);
  if (!ws) throw new ApiAuthError("workspace_not_found", 404);

  return { workspaceId: ws.id, workspaceSlug: ws.slug, workspaceName: ws.name };
}

/**
 * Run `fn` with the API request authenticated + the workspace GUC set so
 * RLS scoping is enforced. Translates `ApiAuthError` into a JSON response.
 *
 * Use from every v1 route handler.
 */
export async function withApiAuth<T>(
  req: NextRequest,
  fn: (db: Database, ctx: ApiAuthContext) => Promise<T>,
): Promise<NextResponse> {
  let ctx: ApiAuthContext;
  try {
    ctx = await authenticateApiRequest(req);
  } catch (e) {
    if (e instanceof ApiAuthError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: "auth_failed" }, { status: 500 });
  }

  try {
    const db = dbNode(env.DATABASE_URL);
    const result = await withWorkspace(db, ctx.workspaceId, (tx) => fn(tx, ctx));
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "internal_error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Same as `withApiAuth` but lets the handler return a complete `NextResponse`
 * (e.g. for non-200 status, custom headers). Use for create/update routes
 * that want to return 201.
 */
export async function withApiAuthResponse(
  req: NextRequest,
  fn: (db: Database, ctx: ApiAuthContext) => Promise<NextResponse>,
): Promise<NextResponse> {
  let ctx: ApiAuthContext;
  try {
    ctx = await authenticateApiRequest(req);
  } catch (e) {
    if (e instanceof ApiAuthError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: "auth_failed" }, { status: 500 });
  }

  try {
    const db = dbNode(env.DATABASE_URL);
    return await withWorkspace(db, ctx.workspaceId, (tx) => fn(tx, ctx));
  } catch (e) {
    const message = e instanceof Error ? e.message : "internal_error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
