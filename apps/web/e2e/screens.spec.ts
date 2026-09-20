import { expect, test, type Page } from "@playwright/test";
import { makeState, mockApi } from "./fixtures.ts";

const DIR = "test-results/screens";

async function shoot(page: Page, name: string, project: string) {
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${DIR}/${project}-${name}.png`, fullPage: true });
}

/** These exist so the layout can be looked at, not only asserted on. */
test.describe("screens", () => {
  test("feed", async ({ page }, info) => {
    await mockApi(page, makeState());
    await page.goto("/");
    await expect(page.getByTestId("listing-row").first()).toBeVisible();
    await shoot(page, "feed", info.project.name);
  });

  test("feed showing everything scraped", async ({ page }, info) => {
    await mockApi(page, makeState());
    await page.goto("/?scope=all");
    await expect(page.getByTestId("listing-row")).toHaveCount(9);
    await shoot(page, "feed-all", info.project.name);
  });

  test("listing detail", async ({ page }, info) => {
    await mockApi(page, makeState());
    await page.goto("/listings/lst_calvert");
    await expect(page.getByRole("heading", { name: "Why it scored 91" })).toBeVisible();
    await shoot(page, "detail", info.project.name);
  });

  test("profile editor", async ({ page }, info) => {
    await mockApi(page, makeState());
    await page.goto("/settings/profiles/prof_row6");
    await expect(page.getByTestId("profile-preview")).toContainText("current listings match");
    await shoot(page, "profile-editor", info.project.name);
  });

  test("wizard", async ({ page }, info) => {
    const state = makeState({ setupComplete: false });
    state.profiles = [];
    await mockApi(page, state);
    await page.goto("/setup");
    await page.getByRole("radio", { name: /JHU Homewood/ }).check();
    await page.getByTestId("wizard-next").click();
    await page.getByLabel("Full name").fill("Sam Rivera");
    await page.getByLabel("Email").fill("srivera@example.edu");
    await shoot(page, "wizard-identity", info.project.name);
    await page.getByTestId("wizard-next").click();
    await expect(page.getByRole("heading", { name: "What are you looking for?" })).toBeVisible();
    await page.getByLabel("Name this search").fill("Row home for 6");
    await shoot(page, "wizard", info.project.name);
  });

  test("wizard push step", async ({ page }, info) => {
    const state = makeState({ setupComplete: false });
    state.profiles = [];
    await mockApi(page, state);
    await page.goto("/setup");
    await page.getByRole("radio", { name: /JHU Homewood/ }).check();
    await page.getByTestId("wizard-next").click();
    await page.getByLabel("Full name").fill("Sam Rivera");
    await page.getByLabel("Email").fill("srivera@example.edu");
    await page.getByTestId("wizard-next").click();
    await page.getByLabel("Name this search").fill("Row home for 6");
    await page.getByTestId("wizard-next").click();
    await expect(page.getByTestId("qr-code")).toBeVisible();
    await shoot(page, "wizard-push", info.project.name);
  });

  test("drafts queue", async ({ page }, info) => {
    await mockApi(page, makeState());
    await page.goto("/drafts");
    await expect(page.getByTestId("draft-item").first()).toBeVisible();
    await shoot(page, "drafts", info.project.name);
  });

  test("pipeline", async ({ page }, info) => {
    await mockApi(page, makeState());
    await page.goto("/pipeline");
    await expect(page.getByTestId("pipeline-card").first()).toBeVisible();
    await shoot(page, "pipeline", info.project.name);
  });

  test("sources", async ({ page }, info) => {
    await mockApi(page, makeState());
    await page.goto("/sources");
    await expect(page.getByTestId("source-row").first()).toBeVisible();
    await shoot(page, "sources", info.project.name);
  });

  test("notifications", async ({ page }, info) => {
    await mockApi(page, makeState());
    await page.goto("/notifications");
    await expect(page.getByTestId("notification").first()).toBeVisible();
    await shoot(page, "notifications", info.project.name);
  });

  test("map", async ({ page }, info) => {
    await mockApi(page, makeState());
    await page.route("**/tile.openstreetmap.org/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e8e6e1"/><path d="M0 128h256M128 0v256" stroke="#d3d0c9" stroke-width="2"/></svg>',
      }),
    );
    await page.goto("/map");
    await expect(page.locator(".leaflet-container")).toBeVisible();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${DIR}/${info.project.name}-map.png` });
  });

  test("feed in dark mode", async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await mockApi(page, makeState());
    await page.goto("/");
    await expect(page.getByTestId("listing-row").first()).toBeVisible();
    await shoot(page, "feed-dark", info.project.name);
  });

  test("listing detail in dark mode", async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await mockApi(page, makeState());
    await page.goto("/listings/lst_calvert");
    await expect(page.getByRole("heading", { name: "Why it scored 91" })).toBeVisible();
    await shoot(page, "detail-dark", info.project.name);
  });
});
