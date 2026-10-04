import { expect, test } from "@playwright/test";
import { makeState, mockApi } from "./fixtures.ts";

test.describe("the daily push budget", () => {
  test("counts the day's pushes against the budget", async ({ page }) => {
    await mockApi(page, makeState());
    await page.goto("/settings/ntfy");

    const meter = page.getByTestId("push-budget");
    await expect(meter).toContainText("14 of 200 pushes today");
    await expect(meter).toContainText(
      "Past 160, only urgent matches push on their own and the rest arrive as one digest.",
    );
  });

  test("says nothing when no budget is set", async ({ page }) => {
    const state = makeState();
    state.pushes = { today: 0, budget: 0 };
    await mockApi(page, state);
    await page.goto("/settings/ntfy");

    await expect(page.getByTestId("ntfy-profile").first()).toBeVisible();
    await expect(page.getByTestId("push-budget")).toHaveCount(0);
  });

  test("repeats the count on the notifications header", async ({ page }) => {
    await mockApi(page, makeState());
    await page.goto("/notifications");
    await expect(page.getByTestId("push-count")).toHaveText("14 of 200 pushes today");
  });

  test("leaves the notifications header alone when no budget is set", async ({ page }) => {
    const state = makeState();
    state.pushes = { today: 0, budget: 0 };
    await mockApi(page, state);
    await page.goto("/notifications");

    await expect(page.getByTestId("notification").first()).toBeVisible();
    await expect(page.getByTestId("push-count")).toHaveCount(0);
  });
});
