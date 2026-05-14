export const SESSION_COOKIE = "__Host-session";
export const STATE_COOKIE = "__Host-oauth-state";

export interface CookieAttrs {
  httpOnly: boolean;
  sameSite: "lax" | "strict" | "none";
  secure: boolean;
  path: string;
  maxAge?: number;
}

export const baseCookieAttrs: CookieAttrs = {
  httpOnly: true,
  sameSite: "lax",
  secure: true,
  path: "/",
};

export function serializeCookie(name: string, value: string, attrs: CookieAttrs): string {
  const sameSite = attrs.sameSite[0]!.toUpperCase() + attrs.sameSite.slice(1);
  const parts = [`${name}=${value}`];
  parts.push(`Path=${attrs.path}`);
  parts.push(`SameSite=${sameSite}`);
  if (attrs.httpOnly) parts.push("HttpOnly");
  if (attrs.secure) parts.push("Secure");
  if (attrs.maxAge !== undefined) parts.push(`Max-Age=${attrs.maxAge}`);
  return parts.join("; ");
}
