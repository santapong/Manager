import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { dbNode } from "@manager/db";
import { env } from "@/src/env";
import { logger } from "@manager/observability";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/, "");
  if (!env.HEALTH_TOKEN || token !== env.HEALTH_TOKEN) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const startedAt = Date.now();
  const checks: Record<string, { ok: boolean; ms: number; error?: string }> = {};

  async function timed(name: string, fn: () => Promise<unknown>) {
    const t0 = Date.now();
    try {
      await fn();
      checks[name] = { ok: true, ms: Date.now() - t0 };
    } catch (e) {
      checks[name] = {
        ok: false,
        ms: Date.now() - t0,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  await timed("db_read", () => dbNode(env.DATABASE_URL).execute(sql`select 1`));
  await timed("db_write", async () => {
    const db = dbNode(env.DATABASE_URL);
    await db.execute(sql`create temporary table if not exists __health (ts timestamptz not null default now())`);
    await db.execute(sql`insert into __health default values`);
  });

  const ok = Object.values(checks).every((c) => c.ok);
  logger.info("health_deep", { ok, checks, elapsedMs: Date.now() - startedAt });
  return NextResponse.json(
    { status: ok ? "ok" : "degraded", checks, elapsedMs: Date.now() - startedAt },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
