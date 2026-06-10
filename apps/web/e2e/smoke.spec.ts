import { expect, test } from "@playwright/test";
import { devLogin } from "./helpers";

const TEST_EMAIL = `smoke-${Date.now()}@test.local`;

test.describe("Phase 0 smoke", () => {
  test("sign-in page renders without auth", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { name: /sign in to manager/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
  });

  test("authenticated user creates workspace + project + task", async ({ page, request }) => {
    await page.goto("/sign-in"); // establish origin for cookie set
    await devLogin(page, request, TEST_EMAIL);

    await page.goto("/welcome");
    await expect(page.getByRole("heading", { name: /welcome to manager/i })).toBeVisible();

    await page.getByLabel(/workspace name/i).fill("Smoke Inc");
    await page.getByLabel(/url slug/i).fill(`smoke-${Date.now().toString(36)}`);
    await page.getByRole("button", { name: /create workspace/i }).click();

    await expect(page).toHaveURL(/\/smoke-/);
    await expect(page.getByRole("heading", { name: /projects/i })).toBeVisible();

    await page.getByRole("link", { name: /new project/i }).click();
    await page.getByLabel(/project name/i).fill("Engineering");
    await page.getByLabel(/^key$/i).fill("ENG");
    await page.getByRole("button", { name: /create project/i }).click();

    // Dev-server cold compiles can push this past the default 5s.
    await expect(page).toHaveURL(/\/projects\/ENG$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /engineering/i })).toBeVisible();

    const titleInput = page.getByPlaceholder(/add a task/i);
    await titleInput.fill("Wire up RLS isolation test");
    await page.getByRole("button", { name: /^add$/i }).click();
    await expect(page.getByText("Wire up RLS isolation test")).toBeVisible();
    await expect(page.getByText("ENG-1")).toBeVisible();

    // Drawer: set type / due date / assignee / points (Phase 1 PR 1 fields).
    await page.getByRole("button", { name: /open task ENG-1/i }).click();
    await page.getByLabel(/^type$/i).selectOption("bug");
    await page.getByLabel(/due date/i).fill("2030-01-02");
    await page.getByLabel(/^assignee$/i).selectOption({ index: 1 }); // self
    await page.getByLabel(/^points$/i).fill("3");
    await page.getByLabel(/^points$/i).blur();
    await page.getByRole("button", { name: /^close$/i }).click();

    // Row chips reflect the new fields.
    await expect(page.getByTitle("bug")).toBeVisible();
    await expect(page.getByTitle("Due 2030-01-02")).toBeVisible();
    await expect(page.getByTitle(new RegExp(`Assigned to`, "i"))).toBeVisible();
  });
});
