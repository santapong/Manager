import { expect, test } from "@playwright/test";
import { devLogin } from "./helpers";

const ts = Date.now();
const OWNER_EMAIL = `inv-owner-${ts}@test.local`;
const INVITEE_EMAIL = `inv-member-${ts}@test.local`;

test.describe("Member invites", () => {
  test("owner invites by email, invitee accepts via link and joins", async ({
    page,
    request,
    browser,
  }) => {
    // Owner: workspace + invite.
    await page.goto("/sign-in");
    await devLogin(page, request, OWNER_EMAIL);

    await page.goto("/welcome");
    await page.getByLabel(/workspace name/i).fill("Invite Inc");
    const slug = `inv-${ts.toString(36)}`;
    await page.getByLabel(/url slug/i).fill(slug);
    await page.getByRole("button", { name: /create workspace/i }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}`));

    await page.getByRole("link", { name: /^members$/i }).click();
    await expect(page.getByRole("heading", { name: /members/i })).toBeVisible();

    await page.getByLabel(/invite by email/i).fill(INVITEE_EMAIL);
    await page.getByRole("button", { name: /send invite/i }).click();

    await expect(page.getByText(/invite sent to/i)).toBeVisible();
    const inviteUrl = await page.getByLabel(/invite link/i).inputValue();
    expect(inviteUrl).toContain("/invite/");

    // Pending invite is listed (scope to the list row — the email also
    // appears in the "invite sent" confirmation box).
    await expect(page.locator("li", { hasText: INVITEE_EMAIL })).toBeVisible();

    // Invitee: separate browser context, accept via the link.
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    try {
      await pageB.goto("/sign-in");
      await devLogin(pageB, contextB.request, INVITEE_EMAIL);

      await pageB.goto(inviteUrl);
      await expect(pageB.getByRole("heading", { name: /join invite inc/i })).toBeVisible();
      await pageB.getByRole("button", { name: /accept invitation/i }).click();

      // Dev-server cold compiles can push this past the default 5s.
      await expect(pageB).toHaveURL(new RegExp(`/${slug}$`), { timeout: 15_000 });
      await expect(pageB.getByRole("heading", { name: /projects/i })).toBeVisible();

      // Re-using the link fails closed.
      await pageB.goto(inviteUrl);
      await expect(pageB.getByRole("heading", { name: /invite already used/i })).toBeVisible();
    } finally {
      await contextB.close();
    }

    // Owner sees the new member; the pending invite is gone.
    await page.reload();
    await expect(
      page.getByRole("list").filter({ hasText: INVITEE_EMAIL }).first(),
    ).toBeVisible();
    await expect(page.getByText(/pending invites/i)).toHaveCount(0);
  });
});
