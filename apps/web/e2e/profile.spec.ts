import { expect, test } from "@playwright/test";
import { makeState, mockApi } from "./fixtures.ts";
import { pill } from "./helpers.ts";

test.describe("profile editor", () => {
  test("shows a live match count that follows the budget", async ({ page }) => {
    await mockApi(page, makeState());
    await page.goto("/settings/profiles/prof_row6");

    const preview = page.getByTestId("profile-preview");
    await expect(preview).toContainText("9 of 9 current listings match");

    await page.getByLabel("Max per person").fill("200");
    await expect(preview).toContainText("2 of 9 current listings match");
    await expect(preview).toContainText("costs more than your budget");

    await page.getByLabel("Max per person").fill("2000");
    await expect(preview).toContainText("9 of 9 current listings match");
  });

  test("edits every section and saves", async ({ page }) => {
    const state = makeState();
    await mockApi(page, state);
    await page.goto("/settings/profiles/prof_row6");

    await page.getByLabel("Profile name").fill("Row home for 6, June start");
    await page.getByLabel("Bedrooms, min").fill("5");
    await page.getByLabel("Max walk, minutes").fill("18");

    const laundry = page.getByRole("group", { name: "Laundry in unit" });
    await pill(laundry, "Must").click();
    await expect(laundry.getByRole("radio", { name: "Must" })).toBeChecked();

    await page.getByRole("checkbox", { name: "Require photos" }).check();
    await pill(page, "Nine East 33rd").click();

    await page.getByRole("button", { name: "Save profile" }).click();

    await expect(page).toHaveURL(/\/settings$/);
    const saved = state.profiles.find((p) => p.id === "prof_row6");
    expect(saved?.name).toBe("Row home for 6, June start");
    expect(saved?.preferences.location.maxWalkMinutes).toBe(18);
    expect(saved?.preferences.rules.requirePhotos).toBe(true);
    expect(saved?.preferences.exclusions.buildings).toContain("Nine East 33rd");
    expect(saved?.preferences.amenities.laundryInUnit).toBe("must");
  });

  test("creates a profile from the defaults", async ({ page }) => {
    const state = makeState();
    await mockApi(page, state);
    await page.goto("/settings");
    await page.getByRole("link", { name: "New profile" }).click();

    await page.getByLabel("Profile name").fill("Studio for one");
    await page.getByLabel("People splitting rent").fill("1");
    await page.getByRole("button", { name: "Save profile" }).click();

    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole("link", { name: /Studio for one/ })).toBeVisible();
    expect(state.profiles).toHaveLength(3);
  });

  test("keeps the list of profiles readable at a glance", async ({ page }) => {
    await mockApi(page, makeState());
    await page.goto("/settings");
    await expect(page.getByRole("link", { name: /Row home for 6/ })).toContainText("6 people");
    await expect(page.getByRole("link", { name: /Row home for 6/ })).toContainText("$800 each max");
  });
});
