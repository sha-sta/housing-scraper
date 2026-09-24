import { expect, test, type Page } from "@playwright/test";
import { makeState, mockApi } from "./fixtures.ts";

/** On desktop the feed stays mounted behind the drawer, so assertions scope to the detail. */
const detail = (page: Page) => page.getByTestId("listing-detail");

test.describe("listing detail and outreach", () => {
  test("opens from the feed and shows why it scored", async ({ page }) => {
    await mockApi(page, makeState());
    await page.goto("/");
    await page.getByRole("link", { name: "2914 N Calvert St" }).click();

    await expect(page).toHaveURL(/\/listings\/lst_calvert$/);
    const view = detail(page);
    await expect(view.getByRole("heading", { name: "Why it scored 91" })).toBeVisible();
    await expect(view.getByRole("heading", { name: "2914 N Calvert St" })).toBeVisible();
    await expect(view.getByText("$650 each", { exact: true })).toBeVisible();
    await expect(view.getByText("Strong fit")).toBeVisible();
    await expect(view.getByRole("heading", { name: "Every profile" })).toBeVisible();
    await expect(view.getByText("Wrong number of bedrooms")).toBeVisible();
    await expect(view.getByRole("link", { name: "Craigslist" })).toBeVisible();
    await expect(view.getByRole("link", { name: "JHU Off-Campus Housing" })).toBeVisible();
    await expect(view.getByRole("link", { name: "(410) 555-0134" })).toHaveAttribute(
      "href",
      "tel:4105550134",
    );
    await expect(view.getByRole("link", { name: "leasing@calvertrow.test" })).toHaveAttribute(
      "href",
      "mailto:leasing@calvertrow.test",
    );
    await expect(view.getByText("Down $200 since")).toBeVisible();
  });

  test("deep links straight to a listing, the way an ntfy push does", async ({ page }) => {
    await mockApi(page, makeState());
    await page.goto("/listings/lst_guilford");
    await expect(detail(page).getByRole("heading", { name: "3111 Guilford Ave" })).toBeVisible();
    await expect(detail(page).getByLabel("Notes")).toHaveValue("Called, left a message Tuesday.");
  });

  test("edits the draft, copies it, and marks it sent", async ({ page }) => {
    await mockApi(page, makeState());
    await page.goto("/listings/lst_calvert");

    const panel = page.getByTestId("draft-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("send-draft")).toHaveCount(0);
    await expect(panel).not.toContainText("SMTP");

    await panel.getByLabel("Message").fill("Hello Dana, we can sign this week. Guarantors ready.");

    await expect(panel.getByTestId("mark-sent")).toHaveCount(0);

    await panel.getByTestId("copy-all").click();
    await expect(panel.getByTestId("copy-all")).toContainText("Copied");

    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain("To: leasing@calvertrow.test");
    expect(clipboard).toContain("we can sign this week");

    await panel.getByTestId("mark-sent").click();
    await expect(page.getByTestId("draft-sent")).toBeVisible();
    await expect(page.getByTestId("draft-sent")).toContainText("This listing moved to Contacted");
    await expect(detail(page).getByLabel("Stage")).toHaveValue("contacted");
  });

  test("copies the address, subject and body on their own", async ({ page }) => {
    await mockApi(page, makeState());
    await page.goto("/listings/lst_calvert");
    const panel = page.getByTestId("draft-panel");

    await panel.getByTestId("copy-subject").click();
    await expect(panel.getByTestId("copy-subject")).toContainText("Copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "Interested in 2914 N Calvert St",
    );

    await panel.getByTestId("copy-to").click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "leasing@calvertrow.test",
    );

    await panel.getByTestId("copy-body").click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("Hello Dana");
  });

  test("opens the draft in the mailbox the owner chose", async ({ page }) => {
    await mockApi(page, makeState({ composeVia: "outlook" }));
    await page.goto("/listings/lst_calvert");

    const open = page.getByTestId("open-in-mail");
    await expect(open).toContainText("Open in Outlook");
    const href = await open.getAttribute("href");
    expect(href).toContain("https://outlook.office.com/mail/deeplink/compose");
    expect(href).toContain("to=leasing%40calvertrow.test");
    expect(href).toContain("subject=Interested%20in%202914%20N%20Calvert%20St");
  });

  test("falls back to the device mail app when that is the setting", async ({ page }) => {
    await mockApi(page, makeState({ composeVia: "mailto" }));
    await page.goto("/listings/lst_calvert");
    const open = page.getByTestId("open-in-mail");
    await expect(open).toContainText("Open in mail app");
    await expect(open).toHaveAttribute("href", /^mailto:leasing%40calvertrow\.test\?subject=/);
  });

  test("offers Send now only when the server has SMTP", async ({ page }) => {
    await mockApi(page, makeState({ smtpConfigured: true }));
    await page.goto("/listings/lst_calvert");

    const panel = page.getByTestId("draft-panel");
    await panel.getByLabel("Subject").fill("Still available? 2914 N Calvert St");
    await panel.getByTestId("send-draft").click();

    await expect(page.getByTestId("draft-sent")).toBeVisible();
    await expect(page.getByTestId("toast").first()).toContainText("Sent");
    await expect(detail(page).getByLabel("Stage")).toHaveValue("contacted");
  });

  test("a web form draft copies the text and opens the form", async ({ page }) => {
    await mockApi(page, makeState());
    await page.goto("/listings/lst_guilford");
    const panel = page.getByTestId("draft-panel");
    await expect(panel).toContainText("Web form");
    await expect(panel.getByRole("link", { name: "Open form" })).toHaveAttribute(
      "href",
      "https://example.test/rf/9921/contact",
    );
    await expect(panel.getByTestId("mark-sent")).toBeVisible();
  });

  test("a phone-only draft offers a prefilled text message", async ({ page }) => {
    await mockApi(page, makeState());
    await page.goto("/listings/lst_remington");
    const panel = page.getByTestId("draft-panel");
    await expect(panel).toContainText("Text message");
    await expect(panel.getByRole("link", { name: "Open in Messages" })).toHaveAttribute(
      "href",
      /^sms:4435550199\?&body=Hi%2C%20is%202708/,
    );
  });

  test("moves a listing through the stages and writes a note", async ({ page }) => {
    await mockApi(page, makeState());
    await page.goto("/listings/lst_calvert");

    await detail(page).getByLabel("Stage").selectOption("touring");
    await expect(detail(page).getByLabel("Stage")).toHaveValue("touring");

    const notes = detail(page).getByLabel("Notes");
    await notes.fill("Tour booked for Thursday at 5.");
    await notes.blur();
    await page.reload();
    await expect(detail(page).getByLabel("Notes")).toHaveValue("Tour booked for Thursday at 5.");
  });

  test("explains a building that has several floor plans", async ({ page }) => {
    await mockApi(page, makeState());
    await page.goto("/listings/lst_wyman");
    const view = detail(page);
    await expect(view.getByText("$1,500 to $4,200")).toBeVisible();
    await expect(
      view.getByText("This is a building with several floor plans", { exact: false }),
    ).toBeVisible();
    await expect(view.getByText("Studio to 4 bd")).toBeVisible();
  });

  test("labels an income restricted listing", async ({ page }) => {
    await mockApi(page, makeState());
    await page.goto("/listings/lst_barclay");
    const view = detail(page);
    await expect(view.getByText("Income restricted", { exact: true })).toBeVisible();
    await expect(view.getByText("Income restricted housing")).toBeVisible();
  });

  test("prices a per-room row home by the whole unit and says why", async ({ page }) => {
    await mockApi(page, makeState());
    await page.goto("/listings/lst_hopkins");
    const view = detail(page);
    await expect(view.getByText("$4,250")).toBeVisible();
    await expect(view.getByText("$850 per room")).toBeVisible();
    await expect(
      view.getByText(
        "This landlord quotes a price for each bedroom. The total above is $850 across 5 bedrooms.",
      ),
    ).toBeVisible();
    await expect(view.getByText("Priced")).toBeVisible();
    await expect(view.getByText("Per room", { exact: true })).toBeVisible();
  });

  test("stays quiet about pricing when a listing is priced by the whole unit", async ({
    page,
  }) => {
    await mockApi(page, makeState());
    await page.goto("/listings/lst_calvert");
    await expect(detail(page).getByText("Priced", { exact: true })).toHaveCount(0);
  });

  test("says a gone listing is only missing, not gone for good", async ({ page }) => {
    await mockApi(page, makeState());
    await page.goto("/listings/lst_toogood");
    const chip = detail(page).getByText("Not seen lately");
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute(
      "title",
      "Missing from every source for 3 checks in a row",
    );
  });

  test("lists only the facts a listing actually has", async ({ page }) => {
    await mockApi(page, makeState());
    await page.goto("/listings/lst_remington");
    const view = detail(page);
    await expect(view).toContainText("Not listed: size, move-in date");
    await expect(view.getByText("Move-in date not listed")).toHaveCount(0);
    await expect(view.getByText("Sublet", { exact: true })).toHaveCount(0);
    await expect(view.getByText("Bedrooms", { exact: true })).toBeVisible();
  });

  test("the gallery counts only the photos that still work", async ({ page }) => {
    await mockApi(page, makeState());
    await page.goto("/listings/lst_calvert");
    await expect(page.getByTestId("gallery-count")).toHaveText("1 of 2");

    await page.route("**/img.offcampusimages.test/**", (route) =>
      route.fulfill({ status: 403, contentType: "text/plain", body: "Forbidden" }),
    );
    await page.reload();
    await expect(page.getByTestId("gallery-count")).toHaveCount(0);
    await expect(detail(page).locator("img")).toHaveCount(1);
  });

  test("warns plainly about a scam", async ({ page }) => {
    await mockApi(page, makeState());
    await page.goto("/listings/lst_toogood");
    await expect(detail(page).getByText("This one looks like a scam")).toBeVisible();
    await expect(detail(page).getByText("Asks for a wire transfer or gift cards")).toBeVisible();
  });

  test("regenerates a draft", async ({ page }) => {
    await mockApi(page, makeState());
    await page.goto("/listings/lst_calvert");
    const panel = page.getByTestId("draft-panel");
    await panel.getByRole("button", { name: "Regenerate" }).click();
    await expect(panel.getByLabel("Message")).toHaveValue(/Rewritten draft/);
    await expect(panel).toContainText("Written by Claude");
  });
});
