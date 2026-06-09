import type { APIRequestContext, Page } from "@playwright/test";

export async function devLogin(
  page: Page,
  request: APIRequestContext,
  email: string,
): Promise<void> {
  const token = process.env.DEV_LOGIN_TOKEN;
  if (!token) {
    throw new Error("DEV_LOGIN_TOKEN must be set to run e2e tests");
  }
  const resp = await request.post("/api/dev/login", {
    headers: { authorization: `Bearer ${token}` },
    data: { email },
  });
  if (!resp.ok()) throw new Error(`dev login failed: ${resp.status()} ${await resp.text()}`);
  // Forward the Set-Cookie into the browser context. __Host- cookies must be
  // Secure AND host-only (no Domain attribute), so use the `url` form of
  // addCookies. The url is forced to https:// because CDP refuses to store a
  // Secure cookie via an http:// source — cookies are keyed by host (not
  // scheme/port), and the browser still sends Secure cookies to
  // http://localhost since it's a trustworthy origin.
  const hostname = new URL(page.url() || "http://localhost:3000").hostname;
  const headers = resp.headersArray();
  for (const h of headers) {
    if (h.name.toLowerCase() === "set-cookie") {
      const [name, ...rest] = h.value.split("=");
      const value = rest.join("=").split(";")[0]!;
      await page.context().addCookies([
        {
          name: name!,
          value,
          url: `https://${hostname}`,
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
        },
      ]);
    }
  }
}
