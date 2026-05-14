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
  // Forward the Set-Cookie into the browser context.
  const headers = resp.headersArray();
  for (const h of headers) {
    if (h.name.toLowerCase() === "set-cookie") {
      const [name, ...rest] = h.value.split("=");
      const value = rest.join("=").split(";")[0]!;
      await page.context().addCookies([
        {
          name: name!,
          value,
          domain: new URL(page.url() || (await request.storageState()).origins[0]?.origin || "http://localhost").hostname,
          path: "/",
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ]);
    }
  }
}
