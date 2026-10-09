import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { RawListingInput } from "@housing/shared";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { silentLogger } from "../src/log.ts";
import { createPhotoChecker, type PhotoChecker } from "../src/notify/photos.ts";
import { addProfile, addSource, createHarness, fakeAdapter, runOnce, type Harness } from "./harness.ts";

interface Seen {
  method: string;
  path: string;
  userAgent: string | undefined;
}

let server: Server;
let port = 0;
let seen: Seen[] = [];
let clock = 0;

/**
 * One fake photo host, reachable under two hostnames, because the verdict cache is keyed by
 * hostname and a test needs a refused host and a working host that are not the same host.
 */
beforeAll(async () => {
  server = createServer((req, res) => {
    seen.push({ method: req.method ?? "", path: req.url ?? "", userAgent: req.headers["user-agent"] });
    if (req.url === "/good.jpg") {
      res.writeHead(200, { "content-type": "image/jpeg", "content-length": "1024" });
      res.end();
      return;
    }
    if (req.url === "/login.html") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end();
      return;
    }
    res.writeHead(403, { "content-type": "text/plain" });
    res.end();
  });
  // No host, so both 127.0.0.1 and localhost reach it whichever family localhost resolves to.
  await new Promise<void>((resolve) => server.listen(0, resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  seen = [];
  clock = Date.parse("2026-10-09T13:00:00.000Z");
});

function checker(): PhotoChecker {
  return createPhotoChecker({ log: silentLogger(), now: () => clock });
}

/** The JHU portal's shape: a host that answers 403 to anything outside a browser session. */
function refused(): string {
  return `http://127.0.0.1:${port}/photo.jpg`;
}

function loads(): string {
  return `http://localhost:${port}/good.jpg`;
}

describe("photo checker", () => {
  it("skips a photo whose host refuses it and attaches the next one that loads", async () => {
    expect(await checker().pick([refused(), loads()])).toBe(loads());
    expect(seen.map((call) => call.method)).toEqual(["HEAD", "HEAD"]);
    expect(seen.map((call) => call.path)).toEqual(["/photo.jpg", "/good.jpg"]);
    expect(seen.every((call) => (call.userAgent ?? "").includes("Mozilla/5.0"))).toBe(true);
  });

  it("attaches nothing when every candidate is refused", async () => {
    expect(await checker().pick([refused()])).toBeNull();
    expect(seen).toHaveLength(1);
  });

  it("rejects a 2xx that is not an image", async () => {
    expect(await checker().pick([`http://127.0.0.1:${port}/login.html`])).toBeNull();
  });

  it("ignores a photo that is not a URL", async () => {
    expect(await checker().pick(["not a url", loads()])).toBe(loads());
    expect(seen).toHaveLength(1);
  });

  it("asks a host once and then reuses the verdict for six hours", async () => {
    const photos = [refused(), loads()];
    const pick = checker();

    expect(await pick.pick(photos)).toBe(loads());
    expect(seen).toHaveLength(2);

    // Both verdicts are cached now, so a second push costs no requests at all.
    expect(await pick.pick(photos)).toBe(loads());
    expect(seen).toHaveLength(2);

    clock += 6 * 60 * 60 * 1000 + 1;
    expect(await pick.pick(photos)).toBe(loads());
    expect(seen).toHaveLength(4);
  });

  it("gives up after three candidates", async () => {
    const asked: string[] = [];
    const pick = createPhotoChecker({
      log: silentLogger(),
      now: () => clock,
      fetchImpl: async (url) => {
        asked.push(url);
        return new Response(null, { status: 403 });
      },
    });

    const photos = [
      "https://one.example.com/a.jpg",
      "https://two.example.com/b.jpg",
      "https://three.example.com/c.jpg",
      "https://four.example.com/d.jpg",
    ];
    expect(await pick.pick(photos)).toBeNull();
    expect(asked).toEqual(photos.slice(0, 3));
  });
});

describe("a match push", () => {
  let harness: Harness;

  afterEach(() => {
    harness.close();
  });

  it("carries the photo that loads and not the one the host refuses", async () => {
    harness = createHarness({ photos: checker() });
    addProfile(harness);
    addSource(harness, "fake");

    const unit: RawListingInput = {
      sourceId: "fake",
      sourceListingId: "unit-1",
      url: "https://example.com/fake/unit-1",
      title: "5 BR row home on Guilford Ave",
      description: "Bright row home two blocks from campus.",
      price: 3000,
      beds: 5,
      propertyType: "rowhome",
      address: "3210 Guilford Ave, Baltimore, MD 21218",
      lat: 39.3285,
      lon: -76.6149,
      photos: [refused(), loads()],
    };
    await runOnce(harness, fakeAdapter("fake", () => [unit]));

    expect(harness.published).toHaveLength(1);
    expect(harness.published[0]?.attach).toBe(loads());
  });
});
