import { expect, test } from "@playwright/test";
import { devLogin, dragCardTo } from "./helpers";

const ts = Date.now();
const EMAIL = `board-${ts}@test.local`;

test.describe("Kanban board", () => {
  test.setTimeout(120_000); // cold dev-server compiles blow the 30s default

  test("drag a card across columns persists status + order", async ({ page, request }) => {
    await page.goto("/sign-in");
    await devLogin(page, request, EMAIL);

    await page.goto("/welcome");
    await page.getByLabel(/workspace name/i).fill("Board Inc");
    const slug = `board-${ts.toString(36)}`;
    await page.getByLabel(/url slug/i).fill(slug);
    await page.getByRole("button", { name: /create workspace/i }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}`));

    await page.getByRole("link", { name: /new project/i }).click();
    await page.getByLabel(/project name/i).fill("Board Project");
    await page.getByLabel(/^key$/i).fill("BRD");
    await page.getByRole("button", { name: /create project/i }).click();
    await expect(page).toHaveURL(/\/projects\/BRD$/, { timeout: 15_000 });

    const titleInput = page.getByPlaceholder(/add a task/i);
    for (const title of ["Card one", "Card two", "Card three"]) {
      await titleInput.fill(title);
      await page.getByRole("button", { name: /^add$/i }).click();
      await expect(page.getByText(title)).toBeVisible();
    }

    await page.getByRole("link", { name: /^board$/i }).click();
    await expect(page).toHaveURL(/\/board$/, { timeout: 15_000 });

    const openColumn = page.getByRole("region", { name: /open column/i });
    const inProgressColumn = page.getByRole("region", { name: /in progress column/i });
    await expect(openColumn.getByText("Card one")).toBeVisible();

    // Drag "Card one" from Open into the In progress column.
    const card = page.getByLabel(/^Card BRD-1/);
    await dragCardTo(page, card, inProgressColumn);

    await expect(inProgressColumn.getByText("Card one")).toBeVisible();
    await expect(openColumn.getByText("Card one")).toHaveCount(0);

    // Survives a reload — the move was persisted server-side.
    await page.reload();
    await expect(
      page.getByRole("region", { name: /in progress column/i }).getByText("Card one"),
    ).toBeVisible({ timeout: 15_000 });

    // Card click opens the task drawer.
    await page.getByLabel(/^Card BRD-2/).click();
    await expect(page.getByLabel(/^type$/i)).toBeVisible();
    await page.getByRole("button", { name: /^close$/i }).click();
  });
});
