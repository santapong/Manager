import type { APIRequestContext, Locator, Page } from "@playwright/test";

/**
 * dnd-kit's PointerSensor needs real pointer movement (activation distance
 * + continuous moves), which Playwright's dragTo doesn't emit. Drive the
 * mouse manually in steps instead.
 */
export async function dragCardTo(page: Page, card: Locator, target: Locator): Promise<void> {
  const cardBox = await card.boundingBox();
  const targetBox = await target.boundingBox();
  if (!cardBox || !targetBox) throw new Error("drag: element not visible");
  const startX = cardBox.x + cardBox.width / 2;
  const startY = cardBox.y + cardBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 12, startY, { steps: 4 }); // pass activation distance
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
    { steps: 16 },
  );
  await page.mouse.up();
}

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
