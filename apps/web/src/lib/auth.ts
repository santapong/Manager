import { cookies } from "next/headers";
import {
  createAuthService,
  type AuthService,
  type CookieJar,
  baseCookieAttrs,
} from "@manager/auth";
import { dbNode } from "@manager/db";
import { createConsoleEmailService, createResendEmailService } from "@manager/email";
import { env } from "../env";

export async function auth(): Promise<AuthService> {
  const cookieStore = await cookies();
  const cookieJar: CookieJar = {
    get(name) {
      return cookieStore.get(name)?.value;
    },
    set(name, value, { maxAge }) {
      cookieStore.set(name, value, {
        ...baseCookieAttrs,
        secure: env.NODE_ENV === "production",
        maxAge,
      });
    },
    delete(name) {
      cookieStore.set(name, "", {
        ...baseCookieAttrs,
        secure: env.NODE_ENV === "production",
        maxAge: 0,
      });
    },
  };
  const emailService = env.RESEND_API_KEY
    ? createResendEmailService(env.RESEND_API_KEY, env.EMAIL_FROM)
    : createConsoleEmailService();
  return createAuthService({
    db: dbNode(env.DATABASE_URL),
    email: emailService,
    appUrl: env.NEXT_PUBLIC_APP_URL,
    cookieJar,
    fromEmail: env.EMAIL_FROM,
    github:
      env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
        ? { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET }
        : undefined,
  });
}
