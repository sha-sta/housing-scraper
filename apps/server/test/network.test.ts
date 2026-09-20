import { describe, expect, it } from "vitest";
import { isLocalUrl, isTailscaleAddress, tailscaleUrl, type NetworkDetector } from "../src/network.ts";
import { buildMatchPush, dashboardClick, listingClick } from "../src/notify/push.ts";
import { evaluate } from "../src/match/evaluate.ts";
import { makeListing, makeProfile, NOW } from "./helpers.ts";

describe("isLocalUrl", () => {
  it("catches every address that resolves back to the reader's own device", () => {
    for (const url of [
      "http://localhost:4747",
      "http://LOCALHOST:4747/listings/x",
      "https://localhost",
      "http://dash.localhost:4747",
      "http://127.0.0.1:4747",
      "http://127.1.2.3:4747",
      "http://127.255.255.255",
      "http://0.0.0.0:4747",
      "http://[::1]:4747",
    ]) {
      expect(isLocalUrl(url), url).toBe(true);
    }
  });

  it("leaves a reachable address alone", () => {
    for (const url of [
      "http://macbook.tail1234.ts.net:4747",
      "http://100.101.102.103:4747",
      "https://housing.example.com",
      "http://192.168.1.10:4747",
      "http://128.0.0.1:4747",
      "http://10.0.0.5",
    ]) {
      expect(isLocalUrl(url), url).toBe(false);
    }
  });

  it("treats an unparseable string as not local rather than throwing", () => {
    expect(isLocalUrl("not a url")).toBe(false);
    expect(isLocalUrl("")).toBe(false);
  });
});

describe("isTailscaleAddress", () => {
  it("uses the 100.64.0.0/10 boundaries", () => {
    expect(isTailscaleAddress("100.63.255.255")).toBe(false);
    expect(isTailscaleAddress("100.64.0.0")).toBe(true);
    expect(isTailscaleAddress("100.127.255.255")).toBe(true);
    expect(isTailscaleAddress("100.128.0.0")).toBe(false);
  });

  it("rejects addresses outside the range and anything that is not an address", () => {
    expect(isTailscaleAddress("192.168.1.1")).toBe(false);
    expect(isTailscaleAddress("10.0.0.1")).toBe(false);
    expect(isTailscaleAddress("100.64.0")).toBe(false);
    expect(isTailscaleAddress("nonsense")).toBe(false);
  });
});

describe("tailscaleUrl", () => {
  const withName = (address: string | null, name: string | null): NetworkDetector => ({
    address: () => address,
    name: async () => name,
  });

  it("prefers the DNS name", async () => {
    expect(await tailscaleUrl(withName("100.101.102.103", "macbook.tail1234.ts.net"), 4747)).toBe(
      "http://macbook.tail1234.ts.net:4747",
    );
  });

  it("falls back to the address when the CLI says nothing", async () => {
    expect(await tailscaleUrl(withName("100.101.102.103", null), 4747)).toBe("http://100.101.102.103:4747");
  });

  it("returns null when Tailscale is not running", async () => {
    expect(await tailscaleUrl(withName(null, null), 4747)).toBeNull();
  });
});

describe("push tap targets", () => {
  const listing = makeListing();
  const profile = makeProfile();
  const match = evaluate(listing, profile, NOW);
  const base = {
    ntfyServer: "https://ntfy.sh",
    commandTopic: "secret",
    appSecret: "s",
    smtpConfigured: false,
  };
  const local = { ...base, dashboardUrl: "http://localhost:4747" };
  const reachable = { ...base, dashboardUrl: "http://macbook.tail1234.ts.net:4747" };

  it("sends a match push to the source page when the dashboard is localhost", () => {
    expect(buildMatchPush(listing, match, profile, null, local).click).toBe("https://example.com/unit-1");
    expect(listingClick(local, listing)).toBe("https://example.com/unit-1");
  });

  it("omits the tap target when there is no source page either", () => {
    const orphan = makeListing({ sources: [] });
    expect(listingClick(local, orphan)).toBeUndefined();
    expect(buildMatchPush(orphan, match, profile, null, local).click).toBeUndefined();
  });

  it("keeps the dashboard page when the dashboard is reachable", () => {
    expect(buildMatchPush(listing, match, profile, null, reachable).click).toBe(
      `http://macbook.tail1234.ts.net:4747/listings/${listing.id}`,
    );
  });

  it("gives summary, digest, and health pushes no tap target on a local dashboard", () => {
    expect(dashboardClick("http://localhost:4747", "/?profile=prf_1")).toBeUndefined();
    expect(dashboardClick("http://127.0.0.1:4747", "/")).toBeUndefined();
    expect(dashboardClick("http://macbook.tail1234.ts.net:4747", "/?profile=prf_1")).toBe(
      "http://macbook.tail1234.ts.net:4747/?profile=prf_1",
    );
  });

  it("leaves the Open listing action alone either way", () => {
    for (const context of [local, reachable]) {
      expect(buildMatchPush(listing, match, profile, null, context).actions[0]).toEqual({
        action: "view",
        label: "Open listing",
        url: "https://example.com/unit-1",
      });
    }
  });
});
