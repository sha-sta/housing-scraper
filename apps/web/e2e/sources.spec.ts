import { expect, test } from "@playwright/test";
import { makeState, mockApi } from "./fixtures.ts";

test.describe("sources", () => {
  test("shows health, the last error and the failure count", async ({ page }) => {
    await mockApi(page, makeState());
    await page.goto("/sources");

    await expect(page.getByTestId("source-row")).toHaveCount(7);

    const redfin = page.getByTestId("source-row").filter({ hasText: "Redfin rentals" });
    await expect(redfin).toContainText("Failing");
    await expect(redfin).toContainText("3 failed runs in a row");
    await expect(redfin).toContainText("captcha page returned for search URL");

    const craigslist = page.getByTestId("source-row").filter({ hasText: "Craigslist" });
    await expect(craigslist).toContainText("Healthy");
    await expect(craigslist).toContainText("418");
  });

  test("explains what a source still needs", async ({ page }) => {
    await mockApi(page, makeState());
    await page.goto("/sources");

    const appfolio = page.getByTestId("source-row").filter({ hasText: "AppFolio landlords" });
    await expect(appfolio).toContainText("Needs setup");
    await expect(appfolio).toContainText("Add the landlord subdomains you want watched");

    const facebook = page.getByTestId("source-row").filter({ hasText: "Facebook Marketplace" });
    await expect(facebook).toContainText("pnpm --filter @housing/server login:facebook");
  });

  test("runs a source now and updates its counters", async ({ page }) => {
    await mockApi(page, makeState());
    await page.goto("/sources");

    const redfin = page.getByTestId("source-row").filter({ hasText: "Redfin rentals" });
    await redfin.getByTestId("run-redfin").click();

    await expect(redfin).toContainText("Healthy");
    await expect(redfin).not.toContainText("failed runs in a row");
  });

  test("turns a source off", async ({ page }) => {
    const state = makeState();
    await mockApi(page, state);
    await page.goto("/sources");

    const craigslist = page.getByTestId("source-row").filter({ hasText: "Craigslist" });
    await craigslist.getByRole("checkbox", { name: "Enabled" }).click();

    await expect(craigslist).toContainText("Turned off");
    await expect(craigslist.getByRole("checkbox", { name: "Enabled" })).not.toBeChecked();
    expect(state.sources.find((s) => s.id === "craigslist")?.enabled).toBe(false);
  });

  test("edits the per-source config", async ({ page }) => {
    const state = makeState();
    await mockApi(page, state);
    await page.goto("/sources");

    const appfolio = page.getByTestId("source-row").filter({ hasText: "AppFolio landlords" });
    await appfolio.getByRole("button", { name: "Settings" }).click();
    await appfolio.getByLabel("subdomains").fill("americanmanagement\nhomeservicesofmd");
    await appfolio.getByRole("button", { name: "Save settings" }).click();

    await expect(appfolio).not.toContainText("Needs setup");
    expect(state.sources.find((s) => s.id === "appfolio")?.config).toEqual({
      subdomains: ["americanmanagement", "homeservicesofmd"],
    });
  });
});
