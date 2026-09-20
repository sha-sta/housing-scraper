import { expect, test } from "@playwright/test";
import { NETWORK_READY, makeState, mockApi } from "./fixtures.ts";

const TAILSCALE = "http://christians-mbp:4747";

test.describe("open on your phone", () => {
  test("leads with the fact that pushes already work", async ({ page }) => {
    await mockApi(page, makeState());
    await page.goto("/settings/ntfy");
    const card = page.getByTestId("phone-access");
    await expect(card).toContainText("Pushes already reach your phone");
    await expect(card).toContainText("This step is optional");
  });

  test("state A offers the address, a code and the button that points pushes at it", async ({
    page,
  }) => {
    const state = makeState({ dashboardUrl: "http://localhost:4747" }, NETWORK_READY);
    await mockApi(page, state);
    await page.goto("/settings/ntfy");

    const card = page.getByTestId("phone-access");
    await expect(card.getByTestId("phone-access-ready")).toBeVisible();
    await expect(card.getByTestId("phone-address")).toHaveText(TAILSCALE);
    await expect(card.getByTestId("qr-code")).toBeVisible();

    await card.getByTestId("phone-access-use").click();

    await expect(card).toContainText("Pushes open this address");
    await expect(card.getByTestId("phone-access-use")).toHaveCount(0);
    expect(state.settings.dashboardUrl).toBe(TAILSCALE);
  });

  test("state A can be put back to this computer only", async ({ page }) => {
    const state = makeState({ dashboardUrl: TAILSCALE }, NETWORK_READY);
    await mockApi(page, state);
    await page.goto("/settings/ntfy");

    const card = page.getByTestId("phone-access");
    await expect(card).toContainText("Pushes open this address");
    await card.getByTestId("phone-access-revert").click();

    await expect(card.getByTestId("phone-access-use")).toBeVisible();
    expect(state.settings.dashboardUrl).toBe("http://localhost:4747");
  });

  test("state B walks through three steps with no jargon", async ({ page }) => {
    await mockApi(page, makeState({ dashboardUrl: "http://localhost:4747" }));
    await page.goto("/settings/ntfy");

    const setup = page.getByTestId("phone-access-setup");
    await expect(setup).toBeVisible();
    await expect(setup).toContainText("Install Tailscale on this computer");
    await expect(setup).toContainText("Install Tailscale on your phone");
    await expect(setup).toContainText("Sign in on both with the same account");
    await expect(setup.getByRole("link", { name: "Get Tailscale" })).toHaveAttribute(
      "href",
      "https://tailscale.com/download",
    );

    const words = (await setup.innerText()).toLowerCase();
    for (const jargon of ["vpn", "tailnet", "magicdns", "ip address", " ip "]) {
      expect(words, jargon).not.toContain(jargon);
    }

    await expect(setup.getByTestId("phone-access-recheck")).toBeVisible();
  });

  test("Check again picks up Tailscale once it starts", async ({ page }) => {
    const state = makeState({ dashboardUrl: "http://localhost:4747" });
    await mockApi(page, state);
    await page.goto("/settings/ntfy");
    await expect(page.getByTestId("phone-access-setup")).toBeVisible();

    state.network = NETWORK_READY;
    await page.getByTestId("phone-access-recheck").click();

    await expect(page.getByTestId("phone-access-ready")).toBeVisible();
    await expect(page.getByTestId("phone-address")).toHaveText(TAILSCALE);
  });

  test("state C shows only the address a server install already has", async ({ page }) => {
    await mockApi(page, makeState({ dashboardUrl: "https://housing.example.test" }, {
      dashboardUrlIsLocal: false,
      tailscale: { detected: false, listening: false, url: null },
    }));
    await page.goto("/settings/ntfy");

    const remote = page.getByTestId("phone-access-remote");
    await expect(remote).toBeVisible();
    await expect(remote.getByTestId("phone-address")).toHaveText("https://housing.example.test");
    await expect(page.getByTestId("phone-access-setup")).toHaveCount(0);
  });

  test("the wizard points at the card without adding a step", async ({ page }) => {
    const state = makeState({ setupComplete: false });
    state.profiles = [];
    await mockApi(page, state);
    await page.goto("/setup");
    await page.getByRole("radio", { name: /JHU Homewood/ }).check();
    await page.getByTestId("wizard-next").click();
    await page.getByLabel("Full name").fill("Christian Yoon");
    await page.getByLabel("Email").fill("cyoon@jhu.edu");
    await page.getByTestId("wizard-next").click();
    await page.getByTestId("wizard-next").click();
    await page.getByTestId("wizard-next").click();

    await expect(page.getByRole("heading", { name: "You are watching" })).toBeVisible();
    const link = page.getByRole("link", { name: "Open on your phone" });
    await expect(link).toHaveAttribute("href", "/settings/ntfy");
    await expect(page.getByText("already work on your phone")).toBeVisible();
  });
});
