import { expect, test } from "@playwright/test";
import { devLogin } from "./helpers";

const STAMP = Date.now().toString(36);
const EMAIL_A = `rls-a-${STAMP}@test.local`;
const EMAIL_B = `rls-b-${STAMP}@test.local`;
const SLUG_A = `rls-a-${STAMP}`;
const SLUG_B = `rls-b-${STAMP}`;

test.describe("Workspace isolation", () => {
  test("user B cannot see user A's workspace by URL", async ({ browser, request }) => {
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await pageA.goto("/sign-in");
    await devLogin(pageA, request, EMAIL_A);
    await pageA.goto("/welcome");
    await pageA.getByLabel(/workspace name/i).fill("A Workspace");
    await pageA.getByLabel(/url slug/i).fill(SLUG_A);
    await pageA.getByRole("button", { name: /create workspace/i }).click();
    await expect(pageA).toHaveURL(new RegExp(`/${SLUG_A}$`));

    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await pageB.goto("/sign-in");
    await devLogin(pageB, request, EMAIL_B);
    await pageB.goto("/welcome");
    await pageB.getByLabel(/workspace name/i).fill("B Workspace");
    await pageB.getByLabel(/url slug/i).fill(SLUG_B);
    await pageB.getByRole("button", { name: /create workspace/i }).click();
    await expect(pageB).toHaveURL(new RegExp(`/${SLUG_B}$`));

    // B tries to visit A's workspace — expect 404, never 403 (existence-hiding).
    const resp = await pageB.goto(`/${SLUG_A}`);
    expect(resp?.status()).toBe(404);
  });
});
