import { expect, test } from "@playwright/test";
import { makeState, mockApi } from "./fixtures.ts";

/** Shortcuts are a wide-screen affair, so the phone project proves they stay out of the way. */
test.describe("keyboard shortcuts", () => {
  test("moves a highlight and opens the listing under it", async ({ page }, info) => {
    await mockApi(page, makeState());
    await page.goto("/");
    const rows = page.getByTestId("listing-row");
    await expect(rows.first()).toBeVisible();

    await page.keyboard.press("j");

    if (info.project.name !== "desktop") {
      await expect(rows.first()).toHaveAttribute("data-highlighted", "false");
      return;
    }

    await expect(rows.first()).toHaveAttribute("data-highlighted", "true");
    await page.keyboard.press("j");
    await expect(rows.nth(1)).toHaveAttribute("data-highlighted", "true");
    await expect(rows.first()).toHaveAttribute("data-highlighted", "false");
    await page.keyboard.press("k");
    await expect(rows.first()).toHaveAttribute("data-highlighted", "true");

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/listings\/lst_calvert$/);
  });

  test("stars and hides the highlighted listing", async ({ page }, info) => {
    await mockApi(page, makeState());
    await page.goto("/");
    const rows = page.getByTestId("listing-row");
    await expect(rows.first()).toBeVisible();

    await page.keyboard.press("j");
    await page.keyboard.press("s");

    if (info.project.name !== "desktop") {
      await expect(rows.first().getByRole("button", { name: "Star this listing" })).toBeVisible();
      return;
    }

    await expect(rows.first().getByRole("button", { name: "Remove star" })).toBeVisible();

    await page.keyboard.press("h");
    await expect(rows).toHaveCount(5);
  });

  test("stays quiet while you are typing", async ({ page }) => {
    await mockApi(page, makeState());
    await page.goto("/");
    const search = page.getByLabel("Search listings");
    await search.fill("j");
    await expect(search).toHaveValue("j");
    await expect(page.getByTestId("listing-row").first()).toHaveAttribute(
      "data-highlighted",
      "false",
    );
  });

  test("shows the sheet on a question mark and closes it on Escape", async ({ page }, info) => {
    await mockApi(page, makeState());
    await page.goto("/");
    await expect(page.getByTestId("listing-row").first()).toBeVisible();

    await page.keyboard.press("?");

    if (info.project.name !== "desktop") {
      await expect(page.getByTestId("shortcuts-sheet")).toHaveCount(0);
      return;
    }

    const sheet = page.getByTestId("shortcuts-sheet");
    await expect(sheet).toContainText("Keyboard shortcuts");
    await expect(sheet).toContainText("Open the highlighted listing");

    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
  });

  test("closes the listing drawer on Escape", async ({ page }, info) => {
    await mockApi(page, makeState());
    await page.goto("/listings/lst_calvert");
    await expect(page.getByTestId("listing-detail")).toBeVisible();

    if (info.project.name !== "desktop") {
      await expect(page.getByRole("dialog")).toHaveCount(0);
      return;
    }

    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/$/);
  });
});
