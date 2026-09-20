import { expect, test } from "@playwright/test";
import { makeState, mockApi } from "./fixtures.ts";
import { pill } from "./helpers.ts";

function freshState() {
  const state = makeState({
    setupComplete: false,
    identity: { fullName: "", email: "", phone: "", school: "", blurb: "" },
    composeVia: "mailto",
  });
  state.profiles = [];
  return state;
}

test.describe("first run", () => {
  test("sends an unset install to the wizard", async ({ page }) => {
    await mockApi(page, freshState());
    await page.goto("/");
    await expect(page).toHaveURL(/\/setup$/);
    await expect(page.getByRole("heading", { name: "Where are you studying?" })).toBeVisible();
  });

  test("goes from a fresh clone to a working push", async ({ page }) => {
    const state = freshState();
    await mockApi(page, state);
    await page.goto("/setup");

    await page.getByRole("radio", { name: /JHU Homewood/ }).check();
    await page.getByTestId("wizard-next").click();

    await expect(page.getByRole("heading", { name: "Who is writing?" })).toBeVisible();
    await page.getByLabel("Full name").fill("Sam Rivera");
    await page.getByLabel("Email").fill("srivera@example.edu");
    await page.getByLabel("Phone", { exact: true }).fill("(410) 555-0180");
    await page.getByLabel("School and year").fill("Johns Hopkins University, Class of 2028");
    await expect(page.getByRole("radio", { name: "Open in Outlook" })).toBeChecked();
    await page.getByTestId("wizard-next").click();

    await expect(page.getByRole("heading", { name: "What are you looking for?" })).toBeVisible();
    await page.getByLabel("Name this search").fill("Row home for 6");
    await page.getByLabel("People").fill("6");
    await page.getByLabel("Bedrooms, at least").fill("5");
    await page.getByLabel("Max per person").fill("800");
    await page.getByLabel("Walk, max minutes").fill("15");
    await page.getByLabel("Move in from").fill("2027-06-01");
    await page.getByLabel("Move in by").fill("2027-08-15");
    await pill(page, "The Marylander").click();
    await expect(page.getByRole("checkbox", { name: "The Marylander" })).toBeChecked();
    await page.getByTestId("wizard-next").click();

    await expect(page.getByRole("heading", { name: "Get it on your phone" })).toBeVisible();
    await expect(page.getByTestId("qr-code")).toBeVisible();
    await page.getByTestId("wizard-test-push").click();
    await expect(page.getByText("Sent. Check your phone.")).toBeVisible();
    await page.getByTestId("wizard-next").click();

    await expect(page.getByRole("heading", { name: "You are watching" })).toBeVisible();
    await page.getByTestId("wizard-next").click();

    await expect(page).toHaveURL(/localhost:4173\/$/);
    await expect(page.getByRole("heading", { name: "Feed" })).toBeVisible();

    expect(state.settings.setupComplete).toBe(true);
    expect(state.settings.campusId).toBe("homewood");
    expect(state.settings.composeVia).toBe("outlook");
    expect(state.settings.identity.fullName).toBe("Sam Rivera");

    const created = state.profiles[0];
    expect(created?.name).toBe("Row home for 6");
    expect(created?.preferences.group.size).toBe(6);
    expect(created?.preferences.beds.min).toBe(5);
    expect(created?.preferences.price.maxPerPerson).toBe(800);
    expect(created?.preferences.location.maxWalkMinutes).toBe(15);
    expect(created?.preferences.dates.moveInEarliest).toBe("2027-06-01");
    expect(created?.preferences.exclusions.buildings).toEqual(["The Marylander"]);
    expect(created?.preferences.notify.topic).toMatch(/^housing-[a-z2-9]{16}$/);
  });

  test("suggests the mail app for a non school address", async ({ page }) => {
    await mockApi(page, freshState());
    await page.goto("/setup");
    await page.getByTestId("wizard-next").click();
    await page.getByLabel("Email").fill("me@gmail.com");
    await expect(page.getByRole("radio", { name: "Open in mail app" })).toBeChecked();
  });

  test("will not move past a step it cannot fill in", async ({ page }) => {
    await mockApi(page, freshState());
    await page.goto("/setup");
    await page.getByTestId("wizard-next").click();
    await expect(page.getByTestId("wizard-next")).toBeDisabled();
  });

  test("keeps a finished install out of the wizard", async ({ page }) => {
    await mockApi(page, makeState());
    await page.goto("/setup");
    await expect(page).toHaveURL(/localhost:4173\/$/);
  });
});
