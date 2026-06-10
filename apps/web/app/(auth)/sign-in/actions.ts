"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/src/lib/auth";

// Relative-path-only redirect target (blocks //evil.com open redirects).
const NextPath = z.string().regex(/^\/(?!\/)/u, "Invalid redirect").optional();

const SignInSchema = z.object({
  email: z.string().email("Enter a valid email"),
  next: NextPath,
});

export async function signInWithMagicLink(_prev: unknown, formData: FormData) {
  const parsed = SignInSchema.safeParse({
    email: formData.get("email"),
    next: formData.get("next") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid email" };
  }
  const svc = await auth();
  await svc.sendMagicLink(parsed.data.email, parsed.data.next);
  return { ok: true, sentTo: parsed.data.email };
}

export async function signInWithGitHub(formData: FormData) {
  const next = NextPath.safeParse(formData.get("next") || undefined);
  const svc = await auth();
  const { redirectUrl } = await svc.startGitHubOAuth(next.success ? next.data : undefined);
  redirect(redirectUrl);
}
