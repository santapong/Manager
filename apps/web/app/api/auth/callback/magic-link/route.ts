import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { auth } from "@/src/lib/auth";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const next = req.nextUrl.searchParams.get("next") ?? "/";
  if (!token) redirect("/sign-in?error=missing_token");
  const svc = await auth();
  try {
    await svc.consumeMagicLink(token);
  } catch (e) {
    const reason = e instanceof Error ? e.message : "invalid_token";
    redirect(`/sign-in?error=${reason}`);
  }
  redirect(next);
}
