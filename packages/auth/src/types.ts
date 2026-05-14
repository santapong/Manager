export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
}

export interface Session {
  user: SessionUser;
  expiresAt: Date;
}

export interface AuthService {
  /** Read the session from cookies. Returns null when unauthenticated. */
  getSession(): Promise<Session | null>;
  /** Same as getSession but throws when unauthenticated. */
  requireSession(): Promise<Session>;
  /** Issue a one-time magic-link token, persist its hash, send the email. */
  sendMagicLink(email: string, callbackUrl?: string): Promise<void>;
  /** Consume a magic-link token, create-or-find the user, mint a session. */
  consumeMagicLink(token: string): Promise<Session>;
  /** Begin a GitHub OAuth flow — returns the URL to redirect the browser to. */
  startGitHubOAuth(callbackUrl?: string): Promise<{ redirectUrl: string; state: string }>;
  /** Exchange the OAuth code for a GitHub access token, link user, mint session. */
  completeGitHubOAuth(code: string, state: string): Promise<Session>;
  /** Invalidate the current session. */
  signOut(): Promise<void>;
}
