import { expect, test } from "@playwright/test";
import { makeState, mockApi } from "./fixtures.ts";

test.describe("pipeline", () => {
  test("counts every column", async ({ page }) => {
    await mockApi(page, makeState());
    await page.goto("/pipeline");

    await expect(page.getByTestId("stage-count-new")).toHaveText("4");
    await expect(page.getByTestId("stage-count-interested")).toHaveText("1");
    await expect(page.getByTestId("stage-count-contacted")).toHaveText("1");
    await expect(page.getByTestId("stage-count-touring")).toHaveText("0");
    await expect(page.getByTestId("stage-count-passed")).toHaveText("1");
  });

  test("folds Passed away until it is asked for", async ({ page }) => {
    await mockApi(page, makeState());
    await page.goto("/pipeline");

    const passed = page.getByTestId("stage-column-passed");
    await expect(passed).toHaveAttribute("data-folded", "true");
    await expect(passed.getByTestId("pipeline-card")).toHaveCount(0);
    await expect(passed).toContainText("Passed");

    await passed.getByRole("button").first().click();
    await expect(passed).toHaveAttribute("data-folded", "false");
    await expect(passed.getByTestId("pipeline-card")).toHaveCount(1);

    // The choice outlives the page, and folding it again sticks too.
    await page.reload();
    await expect(page.getByTestId("stage-column-passed")).toHaveAttribute("data-folded", "false");

    await page.getByTestId("stage-column-passed").getByRole("button").first().click();
    await page.reload();
    await expect(page.getByTestId("stage-column-passed")).toHaveAttribute("data-folded", "true");
  });
});
