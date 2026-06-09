import { NextResponse, type NextRequest } from "next/server";
import { dbNode, sessions, users } from "@manager/db";
import { eq } from "drizzle-orm";
import { baseCookieAttrs, generateToken, SESSION_COOKIE, SESSION_TTL_MS } from "@manager/auth";
import { env } from "@/src/env";

/**
 * E2E-only sign-in shortcut. Skips email/OAuth and mints a session
 * directly. Guarded by NODE_ENV != production AND a shared secret in
 * the DEV_LOGIN_TOKEN env. Returns 404 in any other configuration so
 * the route isn't discoverable.
 */
export async function POST(req: NextRequest) {
  const nodeEnv: string = env.NODE_ENV;
  if (nodeEnv === "production" || !process.env.DEV_LOGIN_TOKEN) {
    return new NextResponse("not_found", { status: 404 });
  }
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/, "");
  if (token !== process.env.DEV_LOGIN_TOKEN) {
    return new NextResponse("forbidden", { status: 403 });
  }
  const body = (await req.json()) as { email?: string };
  const emailAddr = body.email?.toLowerCase();
  if (!emailAddr) return new NextResponse("missing_email", { status: 400 });

  const db = dbNode(env.DATABASE_URL);
  const [existing] = await db.select().from(users).where(eq(users.email, emailAddr)).limit(1);
  let userId: string;
  if (existing) {
    userId = existing.id;
  } else {
    const [created] = await db
      .insert(users)
      .values({ email: emailAddr, emailVerifiedAt: new Date() })
      .returning();
    if (!created) return new NextResponse("user_create_failed", { status: 500 });
    userId = created.id;
  }

  const sessionId = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id: sessionId, userId, expiresAt });

  const res = NextResponse.json({ userId, email: emailAddr });
  // Secure stays on outside production too: __Host- cookies are rejected by
  // browsers without it (localhost is a trustworthy origin, so this works).
  res.cookies.set(SESSION_COOKIE, sessionId, {
    httpOnly: baseCookieAttrs.httpOnly,
    sameSite: baseCookieAttrs.sameSite,
    secure: baseCookieAttrs.secure,
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return res;
}
