import { expect, test } from "@playwright/test";
import { devLogin } from "./helpers";

const ts = Date.now();
const EMAIL = `find-${ts}@test.local`;

test.describe("Search, command palette, list filters", () => {
  test.setTimeout(120_000); // cold dev-server compiles

  test("FTS search page, cmd-k navigation, and URL-param filters", async ({ page, request }) => {
    await page.goto("/sign-in");
    await devLogin(page, request, EMAIL);

    await page.goto("/welcome");
    await page.getByLabel(/workspace name/i).fill("Find Inc");
    const slug = `find-${ts.toString(36)}`;
    await page.getByLabel(/url slug/i).fill(slug);
    await page.getByRole("button", { name: /create workspace/i }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}`));

    await page.getByRole("link", { name: /new project/i }).click();
    await page.getByLabel(/project name/i).fill("Findable");
    await page.getByLabel(/^key$/i).fill("FND");
    await page.getByRole("button", { name: /create project/i }).click();
    await expect(page).toHaveURL(/\/projects\/FND$/, { timeout: 15_000 });

    const titleInput = page.getByPlaceholder(/add a task/i);
    for (const title of ["Refactor the billing engine", "Polish the onboarding emails"]) {
      await titleInput.fill(title);
      await page.getByRole("button", { name: /^add$/i }).click();
      await expect(page.getByText(title)).toBeVisible();
    }

    // Filters: mark FND-1 done via the status dot, then filter by status.
    await page.getByLabel(/status: open/i).first().click(); // open -> in_progress
    await page.getByLabel(/status: in progress/i).first().click(); // -> done
    await page.getByLabel(/filter by status/i).selectOption("done");
    await expect(page).toHaveURL(/status=done/);
    await expect(page.getByText("Refactor the billing engine")).toBeVisible();
    await expect(page.getByText("Polish the onboarding emails")).toHaveCount(0);
    await page.getByRole("button", { name: /clear all/i }).click();
    await expect(page.getByText("Polish the onboarding emails")).toBeVisible();

    // Search page: FTS over title words.
    await page.goto(`/${slug}/search?q=billing`);
    await expect(page.getByRole("link", { name: /FND-1.*billing engine/i })).toBeVisible({
      timeout: 15_000,
    });
    // Result deep-links into the project with the drawer open.
    await page.getByRole("link", { name: /FND-1.*billing engine/i }).click();
    await expect(page).toHaveURL(/projects\/FND\?task=/);
    await expect(page.getByLabel(/add a comment/i)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /^close$/i }).click();

    // Command palette: ctrl-k → navigate to the board.
    await page.keyboard.press("ControlOrMeta+k");
    const paletteInput = page.getByPlaceholder(/jump to/i);
    await expect(paletteInput).toBeVisible();
    await paletteInput.fill("FND — Board");
    await page.getByRole("option", { name: /FND — Board/i }).click();
    await expect(page).toHaveURL(/\/projects\/FND\/board$/, { timeout: 15_000 });

    // Palette task search via FTS.
    await page.keyboard.press("ControlOrMeta+k");
    await paletteInput.fill("onboarding");
    await expect(page.getByRole("option", { name: /FND-2/i })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("option", { name: /FND-2/i }).click();
    await expect(page).toHaveURL(/projects\/FND\?task=/, { timeout: 15_000 });
  });
});
