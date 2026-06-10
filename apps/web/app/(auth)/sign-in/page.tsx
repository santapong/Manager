import { env } from "@/src/env";
import { SignInForm } from "./sign-in-form";

export const metadata = {
  title: "Sign in — Manager",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const githubEnabled = Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);
  return (
    <main className="mx-auto mt-24 max-w-sm px-6">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Sign in to Manager</h1>
      <p className="mb-6 text-sm text-gray-600">We'll email you a one-time sign-in link.</p>
      <SignInForm githubEnabled={githubEnabled} next={next} />
    </main>
  );
}
