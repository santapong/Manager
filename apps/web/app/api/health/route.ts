import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { dbEdge } from "@manager/db";
import { env } from "@/src/env";

// Node runtime: `@manager/db` re-exports the postgres-js client from the
// barrel, which pulls in `net`/`tls`/`stream` and cannot be bundled for the
// Edge runtime. `dbEdge` itself is neon-http (HTTP-only) and would be Edge-
// compatible if imported in isolation, but the package boundary forces Node
// here. See docs/deploy/vercel.md for the rationale.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  let db: "ok" | "fail" = "ok";
  try {
    const result = await dbEdge(env.DATABASE_URL).execute(sql`select 1 as ok`);
    if (!result || (Array.isArray(result) && result.length === 0)) db = "fail";
  } catch {
    db = "fail";
  }
  const body = {
    status: db === "ok" ? "ok" : "degraded",
    db,
    commit: env.VERCEL_GIT_COMMIT_SHA ?? "dev",
    env: env.VERCEL_ENV ?? env.NODE_ENV,
    builtAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
  };
  return NextResponse.json(body, {
    status: db === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
