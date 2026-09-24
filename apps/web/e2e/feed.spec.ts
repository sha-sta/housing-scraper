import { expect, test } from "@playwright/test";
import { makeState, mockApi } from "./fixtures.ts";

test.describe("feed", () => {
  test("lists matching listings with their score, price and split", async ({ page }) => {
    await mockApi(page, makeState());
    await page.goto("/");

    const rows = page.getByTestId("listing-row");
    await expect(rows).toHaveCount(6);

    const first = rows.first();
    await expect(first).toContainText("2914 N Calvert St");
    await expect(first).toContainText("$3,900");
    await expect(first).toContainText("$650 each");
    await expect(first).toContainText("6 bd");
    await expect(first).toContainText("11 min walk");
    await expect(first).toContainText("91");
    await expect(first).toContainText("Craigslist");
    await expect(first).toContainText("+1 more");
  });

  test("switches profile and reruns the query", async ({ page }) => {
    await mockApi(page, makeState());
    await page.goto("/");
    await expect(page.getByTestId("listing-row")).toHaveCount(6);

    await page.getByRole("tab", { name: "Apartment for 4" }).click();
    const rows = page.getByTestId("listing-row");
    await expect(rows.first()).toContainText("420 E 32nd St");
    await expect(rows).toHaveCount(3);
  });

  test("filters by stage", async ({ page }) => {
    await mockApi(page, makeState());
    await page.goto("/");
    await page.getByLabel("Stage").selectOption("interested");
    await expect(page.getByTestId("listing-row").first()).toContainText("3111 Guilford Ave");
    await expect(page.getByTestId("listing-row")).toHaveCount(1);
  });

  test("filters by star", async ({ page }) => {
    await mockApi(page, makeState());
    await page.goto("/");
    await page.getByRole("button", { name: "Starred" }).click();
    await expect(page.getByTestId("listing-row").first()).toContainText("3111 Guilford Ave");
    await expect(page.getByTestId("listing-row")).toHaveCount(1);
  });

  test("filters by text", async ({ page }) => {
    await mockApi(page, makeState());
    await page.goto("/");
    await page.getByLabel("Search listings").fill("Huntingdon");
    await expect(page.getByTestId("listing-row").first()).toContainText("2708 Huntingdon Ave");
    await expect(page.getByTestId("listing-row")).toHaveCount(1);
  });

  test("filters by source", async ({ page }) => {
    await mockApi(page, makeState());
    await page.goto("/");
    await page.getByLabel("Source").selectOption("zumper");
    await expect(page.getByTestId("listing-row").first()).toContainText("420 E 32nd St");
    await expect(page.getByTestId("listing-row")).toHaveCount(1);

    // 2914 N Calvert St is one unit seen on both Craigslist and JHU Off-Campus Housing.
    await page.getByLabel("Source").selectOption("jhu-och");
    await expect(page.getByTestId("listing-row").nth(1)).toContainText("2818 N Calvert St");
    await expect(page.getByTestId("listing-row").first()).toContainText("2914 N Calvert St");
    await expect(page.getByTestId("listing-row")).toHaveCount(2);
  });

  test("sorts by price", async ({ page }) => {
    await mockApi(page, makeState());
    await page.goto("/");
    await page.getByLabel("Sort").selectOption("priceAsc");
    // The server sorts on the listing's own price field, which for 2818 N Calvert St is the
    // per-bedroom rate. The card still leads with the whole-unit total.
    await expect(page.getByTestId("listing-row").first()).toContainText("2818 N Calvert St");
    await expect(page.getByTestId("listing-row").first()).toContainText("$4,250");
    await page.getByLabel("Sort").selectOption("priceDesc");
    await expect(page.getByTestId("listing-row").first()).toContainText("3111 Guilford Ave");
  });

  test("show everything scraped adds rejects and says why in plain words", async ({ page }) => {
    await mockApi(page, makeState());
    await page.goto("/");
    await expect(page.getByText("Wrong number of bedrooms")).toHaveCount(0);

    await page.getByRole("button", { name: "Show everything scraped" }).click();

    await expect(page.getByTestId("listing-row")).toHaveCount(9);
    await expect(
      page.getByTestId("listing-row").filter({ hasText: "3501 St Paul St" }),
    ).toContainText("Wrong number of bedrooms, A building on your exclude list");
    await expect(page.getByText("Possible scam")).toBeVisible();
    await expect(page.getByText("Not seen lately").first()).toBeVisible();
    await expect(page.getByText("Income restricted", { exact: true })).toBeVisible();
    await expect(
      page.getByTestId("listing-row").filter({ hasText: "2500 Barclay St" }),
    ).toContainText("Income restricted housing, Wrong number of bedrooms");
  });

  test("a per-room row home leads with the whole-unit rent", async ({ page }) => {
    await mockApi(page, makeState());
    await page.goto("/");
    const row = page.getByTestId("listing-row").filter({ hasText: "2818 N Calvert St" });
    await expect(row).toContainText("$4,250");
    await expect(row).toContainText("$708 each");
    await expect(row).toContainText("$850 per room");
    await expect(row).not.toContainText("$850 each");
  });

  test("a building with several floor plans shows its range", async ({ page }) => {
    await mockApi(page, makeState());
    await page.goto("/");
    const row = page.getByTestId("listing-row").filter({ hasText: "3200 Wyman Park Dr" });
    await expect(row).toContainText("$1,500 to $4,200");
    await expect(row).toContainText("Studio to 4 bd");
  });

  test("stars a listing from the row", async ({ page }) => {
    await mockApi(page, makeState());
    await page.goto("/");
    const row = page.getByTestId("listing-row").first();
    await row.getByRole("button", { name: "Star this listing" }).click();
    await expect(row.getByRole("button", { name: "Remove star" })).toBeVisible();
  });

  test("an empty filter result says what to do next", async ({ page }) => {
    await mockApi(page, makeState());
    await page.goto("/");
    await page.getByLabel("Search listings").fill("nothing matches this");
    await expect(page.getByText("No listings match these filters")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.getByTestId("listing-row")).toHaveCount(6);
  });

  test("falls back when a photo host refuses the request", async ({ page }) => {
    await mockApi(page, makeState());
    // The JHU portal's photo host answers 403 to anything outside its own page.
    await page.route("**/img.offcampusimages.test/**", (route) =>
      route.fulfill({ status: 403, contentType: "text/plain", body: "Forbidden" }),
    );
    await page.goto("/");

    const row = page.getByTestId("listing-row").filter({ hasText: "2914 N Calvert St" });
    // The first photo is refused, so the row shows the second one rather than a broken icon.
    await expect(row.locator("img")).toHaveJSProperty("naturalWidth", 320);
  });

  test("shows the placeholder when every photo is refused", async ({ page }) => {
    await mockApi(page, makeState());
    await page.route("**/photos/**", (route) =>
      route.fulfill({ status: 403, contentType: "text/plain", body: "Forbidden" }),
    );
    await page.goto("/");

    const row = page.getByTestId("listing-row").filter({ hasText: "2914 N Calvert St" });
    await expect(row.getByText("No photo")).toBeVisible();
    await expect(row.locator("img")).toHaveCount(0);
  });

  test("a wide screen earns a description and amenities on the row", async ({ page }, info) => {
    await mockApi(page, makeState());
    await page.goto("/");
    const row = page.getByTestId("listing-row").first();
    const blurb = row.getByText("Six bedrooms over three floors", { exact: false });
    if (info.project.name === "desktop") {
      await expect(blurb).toBeVisible();
      await expect(row.getByText("Laundry in unit")).toBeVisible();
    } else {
      await expect(blurb).toBeHidden();
    }
  });

  test("hints that the profile row scrolls when it overflows", async ({ page }, info) => {
    const state = makeState();
    const first = state.profiles[0];
    if (first) first.name = "Row home for six people starting in June near Homewood";
    await mockApi(page, state);
    await page.goto("/");
    await expect(page.getByRole("tab").first()).toBeVisible();

    if (info.project.name === "phone") {
      await expect(page.getByTestId("scroll-fade")).toBeVisible();
    }
  });

  test("shows a live indicator", async ({ page }) => {
    await mockApi(page, makeState());
    await page.goto("/");
    await expect(page.getByTestId("live-status").first()).toContainText(/Live|Connecting/);
  });
});
