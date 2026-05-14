"use client";

import { useActionState } from "react";
import { signInWithMagicLink, signInWithGitHub } from "./actions";

type State = { ok?: boolean; sentTo?: string; error?: string };

export function SignInForm({ githubEnabled }: { githubEnabled: boolean }) {
  const [state, formAction, pending] = useActionState<State, FormData>(signInWithMagicLink, {});

  if (state.ok) {
    return (
      <div className="space-y-3 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm">
        <p className="font-medium">Check your inbox.</p>
        <p className="text-gray-600">
          We sent a sign-in link to <span className="font-mono">{state.sentTo}</span>. The link
          expires in 10 minutes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-3">
        <label htmlFor="email" className="block text-sm font-medium text-gray-700">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        {state.error ? (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="block w-full rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send sign-in link"}
        </button>
      </form>
      {githubEnabled ? (
        <>
          <div className="relative my-2">
            <div className="absolute inset-0 flex items-center" aria-hidden>
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-gray-500">or</span>
            </div>
          </div>
          <form action={signInWithGitHub}>
            <button
              type="submit"
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              Continue with GitHub
            </button>
          </form>
        </>
      ) : null}
    </div>
  );
}
