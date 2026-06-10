import { cookies } from "next/headers";
import {
  createAuthService,
  type AuthService,
  type CookieJar,
  baseCookieAttrs,
} from "@manager/auth";
import { dbNode } from "@manager/db";
import { env } from "../env";
import { emailService } from "./email";

export async function auth(): Promise<AuthService> {
  const cookieStore = await cookies();
  // baseCookieAttrs keeps Secure on in every env: the __Host- prefix REQUIRES
  // it — browsers drop the cookie otherwise, even on http://localhost (where
  // Chrome/Firefox accept Secure cookies as a trustworthy-origin exception).
  const cookieJar: CookieJar = {
    get(name) {
      return cookieStore.get(name)?.value;
    },
    set(name, value, { maxAge }) {
      cookieStore.set(name, value, { ...baseCookieAttrs, maxAge });
    },
    delete(name) {
      cookieStore.set(name, "", { ...baseCookieAttrs, maxAge: 0 });
    },
  };
  return createAuthService({
    db: dbNode(env.DATABASE_URL),
    email: emailService(),
    appUrl: env.NEXT_PUBLIC_APP_URL,
    cookieJar,
    fromEmail: env.EMAIL_FROM,
    github:
      env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
        ? { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET }
        : undefined,
  });
}
