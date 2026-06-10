import { expect, test } from "@playwright/test";
import { devLogin } from "./helpers";

const ts = Date.now();
const OWNER_EMAIL = `collab-a-${ts}@test.local`;
const MEMBER_EMAIL = `collab-b-${ts}@test.local`;

test.describe("Comments, mentions, inbox, activity", () => {
  // Two browser contexts + invite + project + drawer round-trips: way past
  // the 30s default against a cold dev server.
  test.setTimeout(180_000);

  test("mention notifies the member; inbox deep-links to the task; feed records changes", async ({
    page,
    request,
    browser,
  }) => {
    // Owner: workspace, project, task; invite the member.
    await page.goto("/sign-in");
    await devLogin(page, request, OWNER_EMAIL);

    await page.goto("/welcome");
    await page.getByLabel(/workspace name/i).fill("Collab Inc");
    const slug = `collab-${ts.toString(36)}`;
    await page.getByLabel(/url slug/i).fill(slug);
    await page.getByRole("button", { name: /create workspace/i }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}`));

    await page.getByRole("link", { name: /^members$/i }).click();
    await page.getByLabel(/invite by email/i).fill(MEMBER_EMAIL);
    await page.getByRole("button", { name: /send invite/i }).click();
    const inviteUrl = await page.getByLabel(/invite link/i).inputValue();

    // Member accepts in a second context.
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    try {
      await pageB.goto("/sign-in");
      await devLogin(pageB, contextB.request, MEMBER_EMAIL);
      await pageB.goto(inviteUrl);
      await pageB.getByRole("button", { name: /accept invitation/i }).click();
      await expect(pageB).toHaveURL(new RegExp(`/${slug}$`), { timeout: 15_000 });

      // Owner creates a project + task.
      await page.getByRole("link", { name: /^projects$/i }).click();
      await page.getByRole("link", { name: /new project/i }).click();
      await page.getByLabel(/project name/i).fill("Collaboration");
      await page.getByLabel(/^key$/i).fill("CLB");
      await page.getByRole("button", { name: /create project/i }).click();
      await expect(page).toHaveURL(/\/projects\/CLB$/, { timeout: 15_000 });

      await page.getByPlaceholder(/add a task/i).fill("Discuss the rollout");
      await page.getByRole("button", { name: /^add$/i }).click();
      await expect(page.getByText("CLB-1")).toBeVisible();

      // Owner opens the drawer, assigns the member, comments with a mention.
      await page.getByRole("button", { name: /open task CLB-1/i }).click();
      await page.getByLabel(/^assignee$/i).selectOption({ label: MEMBER_EMAIL });

      const composer = page.getByLabel(/add a comment/i);
      await composer.fill("What do you think @");
      await composer.press("End");
      // The autocomplete opens on the trailing @ — pick the member.
      await page
        .getByRole("option")
        .filter({ hasText: MEMBER_EMAIL })
        .getByRole("button")
        .click();
      await page.getByRole("button", { name: /^comment$/i }).click();

      // Comment renders with a mention chip; activity feed has entries.
      await expect(page.getByText(`@${MEMBER_EMAIL}`)).toBeVisible();
      await expect(page.getByText(/created this task/i)).toBeVisible();
      await expect(page.getByText(/changed assignee|set assignee/i)).toBeVisible();
      await page.getByRole("button", { name: /^close$/i }).click();

      // Member: unread badge shows assigned + mention; inbox deep-links.
      await pageB.goto(`/${slug}/inbox`);
      await expect(pageB.getByText(/mentioned you on/i)).toBeVisible({ timeout: 15_000 });
      await expect(pageB.getByText(/assigned you/i)).toBeVisible();

      await pageB.getByRole("button", { name: /mentioned you on/i }).click();
      await expect(pageB).toHaveURL(new RegExp(`/projects/CLB\\?task=`), { timeout: 15_000 });
      // Deep link auto-opens the drawer with the comment thread.
      await expect(pageB.getByLabel(/add a comment/i)).toBeVisible({ timeout: 15_000 });
      await expect(pageB.getByText(/what do you think/i)).toBeVisible();
      await pageB.getByRole("button", { name: /^close$/i }).click();

      // Mention is gone from unread after opening it.
      await pageB.goto(`/${slug}/inbox`);
      await expect(pageB.getByText(/mentioned you on/i)).toHaveCount(0);
      // Mark the rest read — badge clears.
      await pageB.getByRole("button", { name: /mark all as read/i }).click();
      await expect(pageB.getByText(/nothing here/i)).toBeVisible();
    } finally {
      await contextB.close();
    }
  });
});
