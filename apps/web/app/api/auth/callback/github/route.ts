import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { auth } from "@/src/lib/auth";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state) redirect("/sign-in?error=missing_code");
  const svc = await auth();
  try {
    await svc.completeGitHubOAuth(code, state);
  } catch (e) {
    const reason = e instanceof Error ? e.message : "oauth_failed";
    redirect(`/sign-in?error=${reason}`);
  }
  redirect("/");
}
