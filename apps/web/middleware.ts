import { NextResponse, type NextRequest } from "next/server";
// Import from the cookies subpath to avoid pulling node:crypto-using modules
// (`service.ts`, `tokens.ts`) into the Edge middleware bundle.
import { SESSION_COOKIE } from "@manager/auth/cookies";

// /api/dev is self-guarding: 404 unless DEV_LOGIN_TOKEN is set and not prod.
const PUBLIC_PATHS = ["/sign-in", "/api/auth", "/api/health", "/api/dev", "/_next", "/favicon.ico"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname === p)) {
    return NextResponse.next();
  }
  const sessionCookie = req.cookies.get(SESSION_COOKIE);
  if (!sessionCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
