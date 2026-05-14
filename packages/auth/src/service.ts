import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import {
  oauthAccounts,
  sessions,
  users,
  verificationTokens,
  type Database,
} from "@manager/db";
import type { EmailService } from "@manager/email";
import { baseCookieAttrs, serializeCookie, SESSION_COOKIE, STATE_COOKIE } from "./cookies";
import { magicLinkEmail } from "./templates/magic-link";
import { generateToken, hashToken, MAGIC_LINK_TTL_MS, SESSION_TTL_MS } from "./tokens";
import type { AuthService, Session, SessionUser } from "./types";

export interface AuthDeps {
  db: Database;
  email: EmailService;
  appUrl: string;
  cookieJar: CookieJar;
  github?: { clientId: string; clientSecret: string };
  fromEmail: string;
}

/**
 * Cookie I/O is injected so the service stays framework-agnostic.
 * Next.js wires `cookies()` from `next/headers` into this.
 */
export interface CookieJar {
  get(name: string): string | undefined;
  set(name: string, value: string, attrs: { maxAge: number }): void;
  delete(name: string): void;
}

export function createAuthService(deps: AuthDeps): AuthService {
  const { db, email, appUrl, cookieJar, github, fromEmail } = deps;
  void fromEmail; // referenced indirectly by email adapter; kept for future tags
  return {
    async getSession() {
      return loadSession(db, cookieJar);
    },

    async requireSession() {
      const session = await loadSession(db, cookieJar);
      if (!session) throw new Error("unauthenticated");
      return session;
    },

    async sendMagicLink(emailAddr: string, callbackUrl) {
      const token = generateToken();
      const tokenHash = hashToken(token);
      const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS);
      await db.insert(verificationTokens).values({
        identifier: emailAddr.toLowerCase(),
        tokenHash,
        expiresAt,
      });
      const url = `${appUrl}/api/auth/callback/magic-link?token=${token}${callbackUrl ? `&next=${encodeURIComponent(callbackUrl)}` : ""}`;
      const { text, html } = magicLinkEmail(url, 10);
      await email.send({
        to: emailAddr,
        subject: "Sign in to Manager",
        text,
        html,
        tags: { kind: "magic_link" },
      });
    },

    async consumeMagicLink(token) {
      const tokenHash = hashToken(token);
      const now = new Date();
      const [row] = await db
        .select()
        .from(verificationTokens)
        .where(
          and(
            eq(verificationTokens.tokenHash, tokenHash),
            gt(verificationTokens.expiresAt, now),
            isNull(verificationTokens.consumedAt),
          ),
        )
        .limit(1);
      if (!row) throw new Error("invalid_token");
      await db
        .update(verificationTokens)
        .set({ consumedAt: now })
        .where(eq(verificationTokens.tokenHash, tokenHash));
      const user = await upsertUserByEmail(db, row.identifier);
      return mintSession(db, cookieJar, user);
    },

    async startGitHubOAuth(callbackUrl) {
      if (!github) throw new Error("github_oauth_not_configured");
      const state = randomBytes(16).toString("base64url");
      const payload = JSON.stringify({ state, next: callbackUrl ?? "/" });
      cookieJar.set(STATE_COOKIE, Buffer.from(payload).toString("base64url"), {
        maxAge: 600,
      });
      const params = new URLSearchParams({
        client_id: github.clientId,
        redirect_uri: `${appUrl}/api/auth/callback/github`,
        scope: "read:user user:email",
        state,
      });
      return {
        redirectUrl: `https://github.com/login/oauth/authorize?${params}`,
        state,
      };
    },

    async completeGitHubOAuth(code, state) {
      if (!github) throw new Error("github_oauth_not_configured");
      const cookie = cookieJar.get(STATE_COOKIE);
      if (!cookie) throw new Error("missing_state");
      const payload = JSON.parse(Buffer.from(cookie, "base64url").toString());
      if (payload.state !== state) throw new Error("state_mismatch");
      cookieJar.delete(STATE_COOKIE);

      const tokenResp = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: github.clientId,
          client_secret: github.clientSecret,
          code,
          redirect_uri: `${appUrl}/api/auth/callback/github`,
        }),
      });
      const tokenJson = (await tokenResp.json()) as { access_token?: string; error?: string };
      if (!tokenJson.access_token) throw new Error(tokenJson.error ?? "github_token_exchange_failed");

      const [userResp, emailResp] = await Promise.all([
        fetch("https://api.github.com/user", {
          headers: { Authorization: `Bearer ${tokenJson.access_token}`, "User-Agent": "manager" },
        }),
        fetch("https://api.github.com/user/emails", {
          headers: { Authorization: `Bearer ${tokenJson.access_token}`, "User-Agent": "manager" },
        }),
      ]);
      const ghUser = (await userResp.json()) as { id: number; login: string; name: string | null; avatar_url: string | null };
      const emails = (await emailResp.json()) as Array<{ email: string; primary: boolean; verified: boolean }>;
      const primary = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified) ?? emails[0];
      if (!primary) throw new Error("no_verified_email");

      const user = await upsertUserByEmail(db, primary.email, {
        name: ghUser.name ?? ghUser.login,
        image: ghUser.avatar_url,
      });
      await db
        .insert(oauthAccounts)
        .values({
          provider: "github",
          providerAccountId: String(ghUser.id),
          userId: user.id,
          accessToken: tokenJson.access_token,
        })
        .onConflictDoUpdate({
          target: [oauthAccounts.provider, oauthAccounts.providerAccountId],
          set: { accessToken: tokenJson.access_token, userId: user.id },
        });
      return mintSession(db, cookieJar, user);
    },

    async signOut() {
      const id = cookieJar.get(SESSION_COOKIE);
      if (id) {
        await db.delete(sessions).where(eq(sessions.id, id));
      }
      cookieJar.delete(SESSION_COOKIE);
    },
  };
}

async function loadSession(db: Database, cookieJar: CookieJar): Promise<Session | null> {
  const id = cookieJar.get(SESSION_COOKIE);
  if (!id) return null;
  const [row] = await db
    .select({
      id: sessions.id,
      expiresAt: sessions.expiresAt,
      userId: users.id,
      email: users.email,
      name: users.name,
      image: users.image,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;
  const user: SessionUser = {
    id: row.userId,
    email: row.email,
    name: row.name,
    image: row.image,
  };
  return { user, expiresAt: row.expiresAt };
}

async function upsertUserByEmail(
  db: Database,
  email: string,
  patch: { name?: string | null; image?: string | null } = {},
) {
  const lower = email.toLowerCase();
  const [existing] = await db.select().from(users).where(eq(users.email, lower)).limit(1);
  if (existing) {
    if (patch.name || patch.image) {
      await db
        .update(users)
        .set({
          name: patch.name ?? existing.name,
          image: patch.image ?? existing.image,
          emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing.id));
    }
    return existing;
  }
  const [created] = await db
    .insert(users)
    .values({
      email: lower,
      name: patch.name ?? null,
      image: patch.image ?? null,
      emailVerifiedAt: new Date(),
    })
    .returning();
  if (!created) throw new Error("user_create_failed");
  return created;
}

async function mintSession(db: Database, cookieJar: CookieJar, user: { id: string; email: string; name: string | null; image: string | null }): Promise<Session> {
  const sessionId = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id: sessionId, userId: user.id, expiresAt });
  cookieJar.set(SESSION_COOKIE, sessionId, { maxAge: Math.floor(SESSION_TTL_MS / 1000) });
  return {
    user: { id: user.id, email: user.email, name: user.name, image: user.image },
    expiresAt,
  };
}

// Re-export cookie helpers for the framework layer
export { baseCookieAttrs, serializeCookie, SESSION_COOKIE, STATE_COOKIE };
