"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/src/lib/auth";

const SignInSchema = z.object({
  email: z.string().email("Enter a valid email"),
});

export async function signInWithMagicLink(_prev: unknown, formData: FormData) {
  const parsed = SignInSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid email" };
  }
  const svc = await auth();
  await svc.sendMagicLink(parsed.data.email);
  return { ok: true, sentTo: parsed.data.email };
}

export async function signInWithGitHub() {
  const svc = await auth();
  const { redirectUrl } = await svc.startGitHubOAuth();
  redirect(redirectUrl);
}
