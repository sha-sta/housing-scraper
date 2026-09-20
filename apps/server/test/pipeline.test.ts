import type { RawListingInput } from "@housing/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MISSED_RUNS_BEFORE_GONE } from "../src/pipeline/run.ts";
import { addProfile, addSource, createHarness, fakeAdapter, runOnce, type Harness } from "./harness.ts";

function unit(overrides: Partial<RawListingInput> = {}): RawListingInput {
  return {
    sourceId: "fake",
    sourceListingId: "unit-1",
    url: "https://example.com/fake/unit-1",
    title: "5 BR row home on Guilford Ave",
    description: "Bright row home two blocks from campus. Email leasing@example.com for a tour.",
    price: 3000,
    beds: 5,
    baths: 2,
    propertyType: "rowhome",
    address: "3210 Guilford Ave, Baltimore, MD 21218",
    neighborhood: "Charles Village",
    lat: 39.3285,
    lon: -76.6149,
    photos: ["https://example.com/photo.jpg"],
    ...overrides,
  };
}

let harness: Harness;
let batch: RawListingInput[];

beforeEach(() => {
  harness = createHarness();
  batch = [unit()];
});

afterEach(() => {
  harness.close();
});

describe("a new listing", () => {
  it("stores, matches, notifies, and stages a draft", async () => {
    const profile = addProfile(harness);
    addSource(harness, "fake");
    const adapter = fakeAdapter("fake", () => batch);

    await runOnce(harness, adapter);

    const listings = harness.repos.listings.active();
    expect(listings).toHaveLength(1);
    const listing = listings[0]!;
    expect(listing.address).toBe("3210 Guilford Ave, Baltimore, MD 21218");
    expect(listing.contact.email).toBe("leasing@example.com");

    const match = harness.repos.profiles.getMatch(listing.id, profile.id);
    expect(match?.matched).toBe(true);
    expect(match?.notifiedAt).not.toBeNull();

    const notifications = harness.repos.notify.list(false, 50);
    expect(notifications.filter((n) => n.kind === "match")).toHaveLength(1);
    expect(harness.published).toHaveLength(1);
    expect(harness.published[0]?.topic).toBe("owner-topic");

    const drafts = harness.repos.outreach.listDrafts("staged");
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.channel).toBe("email");
    expect(drafts[0]?.to).toBe("leasing@example.com");

    // The push carries the draft, so the owner can act from the phone.
    expect(harness.published[0]?.actions?.some((a) => a.label === "Email landlord")).toBe(true);

    expect(harness.events.some((e) => e.type === "listing.upserted" && e.isNew)).toBe(true);
  });

  it("does not notify again on a second run", async () => {
    addProfile(harness);
    addSource(harness, "fake");
    const adapter = fakeAdapter("fake", () => batch);

    await runOnce(harness, adapter);
    await runOnce(harness, adapter);

    expect(harness.published).toHaveLength(1);
    expect(harness.repos.notify.list(false, 50).filter((n) => n.kind === "match")).toHaveLength(1);
    expect(harness.repos.listings.active()).toHaveLength(1);
  });
});

describe("price changes", () => {
  it("appends to the price history and pushes a price drop", async () => {
    const profile = addProfile(harness);
    addSource(harness, "fake");
    const adapter = fakeAdapter("fake", () => batch);

    await runOnce(harness, adapter);
    batch = [unit({ price: 2700 })];
    await runOnce(harness, adapter);

    const listing = harness.repos.listings.active()[0]!;
    expect(listing.price).toBe(2700);
    expect(listing.priceHistory.map((p) => p.price)).toEqual([3000, 2700]);

    const drops = harness.repos.notify.list(false, 50).filter((n) => n.kind === "priceDrop");
    expect(drops).toHaveLength(1);
    expect(drops[0]?.profileId).toBe(profile.id);
    expect(drops[0]?.body).toBe("Now $2,700, was $3,000");
    expect(harness.published).toHaveLength(2);
  });

  it("does not push a price rise", async () => {
    addProfile(harness);
    addSource(harness, "fake");
    const adapter = fakeAdapter("fake", () => batch);

    await runOnce(harness, adapter);
    batch = [unit({ price: 3300 })];
    await runOnce(harness, adapter);

    expect(harness.repos.notify.list(false, 50).filter((n) => n.kind === "priceDrop")).toHaveLength(0);
    expect(harness.repos.listings.active()[0]?.priceHistory).toHaveLength(2);
  });
});

describe("listings that leave and come back", () => {
  it("marks a listing gone after three missed runs and not before", async () => {
    addProfile(harness);
    addSource(harness, "fake");
    const adapter = fakeAdapter("fake", () => batch);

    await runOnce(harness, adapter);
    batch = [];

    for (let run = 1; run < MISSED_RUNS_BEFORE_GONE; run += 1) {
      await runOnce(harness, adapter);
      expect(harness.repos.listings.active()).toHaveLength(1);
    }

    await runOnce(harness, adapter);
    expect(harness.repos.listings.active()).toHaveLength(0);
    expect(harness.repos.listings.all()[0]?.status).toBe("gone");
  });

  it("pushes back on market when a gone listing reappears", async () => {
    addProfile(harness);
    addSource(harness, "fake");
    const adapter = fakeAdapter("fake", () => batch);

    await runOnce(harness, adapter);
    batch = [];
    for (let run = 0; run < MISSED_RUNS_BEFORE_GONE; run += 1) await runOnce(harness, adapter);
    expect(harness.repos.listings.all()[0]?.status).toBe("gone");

    batch = [unit()];
    await runOnce(harness, adapter);

    expect(harness.repos.listings.active()).toHaveLength(1);
    const back = harness.repos.notify.list(false, 50).filter((n) => n.kind === "backOnMarket");
    expect(back).toHaveLength(1);
  });
});

describe("dedupe across sources", () => {
  it("merges the same unit seen on a second source into one listing with two source rows", async () => {
    addProfile(harness);
    addSource(harness, "fake");
    addSource(harness, "other");

    const first = fakeAdapter("fake", () => [unit()]);
    const second = fakeAdapter("other", () => [
      unit({
        sourceId: "other",
        sourceListingId: "other-1",
        url: "https://example.com/other/other-1",
        title: "Five bedroom row house, Guilford Avenue",
        address: "3210 guilford avenue, baltimore md",
        description: null,
        photos: [],
      }),
    ]);

    await runOnce(harness, first);
    await runOnce(harness, second);

    const listings = harness.repos.listings.active();
    expect(listings).toHaveLength(1);
    const listing = listings[0]!;
    expect(listing.sources.map((s) => s.sourceId).sort()).toEqual(["fake", "other"]);
    // The merge keeps what the first source knew rather than blanking it.
    expect(listing.photos).toEqual(["https://example.com/photo.jpg"]);
    expect(listing.description).not.toBeNull();

    // One listing means one match and one push, not two.
    expect(harness.published.filter((p) => p.title.includes("Guilford"))).toHaveLength(1);
  });

  it("keeps a building with a floor plan range separate from a single unit at the address", async () => {
    addProfile(harness);
    addSource(harness, "fake");
    const adapter = fakeAdapter("fake", () => [
      unit(),
      unit({
        sourceListingId: "building-1",
        url: "https://example.com/fake/building-1",
        title: "One to four bedroom apartments",
        beds: 1,
        bedsMax: 4,
        price: 1500,
        priceMax: 4200,
      }),
    ]);

    await runOnce(harness, adapter);
    expect(harness.repos.listings.active()).toHaveLength(2);
  });
});

describe("scam signals", () => {
  it("stores the signals and lets the profile hide the listing", async () => {
    addProfile(harness);
    addSource(harness, "fake");
    const adapter = fakeAdapter("fake", () => [
      unit({
        sourceListingId: "scam-1",
        description: "I am currently out of the country. Wire transfer the deposit before you view it.",
      }),
    ]);

    await runOnce(harness, adapter);
    const listing = harness.repos.listings.active()[0]!;
    expect(listing.scamSignals).toEqual(
      expect.arrayContaining(["landlordOutOfCountry", "wireOrGiftCardLanguage", "depositBeforeViewing"]),
    );

    const profile = harness.repos.profiles.list()[0]!;
    const match = harness.repos.profiles.getMatch(listing.id, profile.id);
    expect(match?.matched).toBe(false);
    expect(match?.rejectedBy).toContain("suspectedScam");
    expect(harness.published).toHaveLength(0);
  });
});

describe("price basis and non-housing", () => {
  it("drops parking and storage rows and keeps a home with a garage", async () => {
    addProfile(harness);
    addSource(harness, "fake");
    const adapter = fakeAdapter("fake", () => [
      unit({ sourceListingId: "p1", title: "Parking Spot 14", beds: null, price: 95, address: null }),
      unit({ sourceListingId: "p2", title: "Secure parking", beds: null, price: 175, address: null }),
      unit({ sourceListingId: "p3", title: "Storage unit B", beds: null, price: 120, address: null }),
      unit({ sourceListingId: "h1", title: "3BR rowhome with garage parking", beds: 3 }),
    ]);

    await runOnce(harness, adapter);
    const stored = harness.repos.listings.active();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.title).toBe("3BR rowhome with garage parking");
  });

  it("prices a per room row home on the whole unit rent", async () => {
    const profile = addProfile(harness);
    addSource(harness, "fake");
    const adapter = fakeAdapter("fake", () => [
      unit({
        sourceListingId: "jhu-1",
        title: "5 bedrooms available in a spectacular renovated rowhome",
        description: "Five large bedrooms, laundry in unit.",
        price: 850,
        beds: 5,
      }),
    ]);

    await runOnce(harness, adapter);
    const listing = harness.repos.listings.active()[0]!;
    expect(listing.priceBasis).toBe("room");

    const match = harness.repos.profiles.getMatch(listing.id, profile.id);
    expect(match?.monthlyTotal).toBe(4250);
    expect(match?.pricePerPerson).toBe(708.33);
    expect(match?.matched).toBe(true);
    expect(match?.rejectedBy).not.toContain("suspectedScam");

    expect(harness.published[0]?.message).toContain("$850 per room, about $4,250 total, $708 each");
  });

  it("keeps the comparison signals off a managed feed", async () => {
    addProfile(harness);
    addSource(harness, "managed");
    const adapter = fakeAdapter("managed", () =>
      Array.from({ length: 8 }, (_, i) =>
        unit({
          sourceId: "managed",
          sourceListingId: `m-${i}`,
          url: `https://example.com/managed/m-${i}`,
          title: `Unit ${i}`,
          address: null,
          photos: [],
          lat: 39.33 + i * 0.001,
          price: i === 0 ? 300 : 3000,
        }),
      ),
    );

    await runOnce(harness, adapter);
    const flagged = harness.repos.listings.active().filter((l) => l.scamSignals.length > 0);
    expect(flagged).toHaveLength(0);
  });
});

describe("the first run of a source", () => {
  it("sends one baseline summary instead of a push per listing", async () => {
    const profile = addProfile(harness);
    addSource(harness, "fake", false);
    const adapter = fakeAdapter("fake", () =>
      Array.from({ length: 12 }, (_, i) =>
        unit({
          sourceListingId: `unit-${i}`,
          url: `https://example.com/fake/unit-${i}`,
          address: `${3200 + i} Guilford Ave, Baltimore, MD 21218`,
          lat: 39.3285 + i * 0.0005,
        }),
      ),
    );

    await runOnce(harness, adapter);

    expect(harness.repos.listings.active()).toHaveLength(12);
    expect(harness.published).toHaveLength(1);
    const summary = harness.published[0]!;
    expect(summary.title).toBe("Baseline ready");
    expect(summary.message).toBe("12 current listings match Row home for 6. New ones will arrive as they appear.");
    expect(summary.click).toBe(`http://localhost:4747/?profile=${profile.id}`);

    // Exactly one notification row, not twelve.
    expect(harness.repos.notify.list(false, 50)).toHaveLength(1);

    // Every baseline match is marked notified so it never pushes later.
    expect(harness.repos.profiles.unnotifiedMatches(profile.id, 0)).toHaveLength(0);

    // Drafts are capped so the Drafts screen is useful without being flooded.
    expect(harness.repos.outreach.listDrafts("staged")).toHaveLength(10);
  });

  it("still pushes a price drop after a baseline run", async () => {
    addProfile(harness);
    addSource(harness, "fake", false);
    let current = [unit()];
    const adapter = fakeAdapter("fake", () => current);

    await runOnce(harness, adapter);
    expect(harness.published).toHaveLength(1);
    expect(harness.published[0]?.title).toBe("Baseline ready");

    current = [unit({ price: 2600 })];
    await runOnce(harness, adapter);

    expect(harness.published).toHaveLength(2);
    expect(harness.published[1]?.title).toContain("Price drop");
  });

  it("pushes normally for listings that arrive after the baseline", async () => {
    addProfile(harness);
    addSource(harness, "fake", false);
    let current = [unit()];
    const adapter = fakeAdapter("fake", () => current);

    await runOnce(harness, adapter);
    current = [unit(), unit({ sourceListingId: "unit-2", url: "https://example.com/fake/unit-2", address: "412 E 31st St, Baltimore, MD 21218", lat: 39.3268, lon: -76.6122 })];
    await runOnce(harness, adapter);

    const matchPushes = harness.published.filter((p) => p.title !== "Baseline ready");
    expect(matchPushes).toHaveLength(1);
    expect(matchPushes[0]?.title).toContain("412 E 31st St");
  });
});

describe("a newly created profile", () => {
  it("baselines against the listings already stored", async () => {
    addSource(harness, "fake");
    const adapter = fakeAdapter("fake", () => [
      unit(),
      unit({ sourceListingId: "unit-2", url: "https://example.com/fake/unit-2", address: "412 E 31st St", lat: 39.3268, lon: -76.6122 }),
    ]);
    await runOnce(harness, adapter);
    expect(harness.published).toHaveLength(0);

    const profile = addProfile(harness);
    await harness.pipeline.evaluateAll(profile, "announce");

    expect(harness.published).toHaveLength(1);
    expect(harness.published[0]?.title).toBe("Baseline ready");
    expect(harness.repos.profiles.unnotifiedMatches(profile.id, 0)).toHaveLength(0);
  });

  it("does not re-notify listings already announced when the profile is edited", async () => {
    const profile = addProfile(harness);
    addSource(harness, "fake");
    const adapter = fakeAdapter("fake", () => batch);
    await runOnce(harness, adapter);
    expect(harness.published).toHaveLength(1);

    const widened = {
      ...profile,
      preferences: { ...profile.preferences, price: { ...profile.preferences.price, maxTotal: 9000 } },
    };
    harness.repos.profiles.update(widened);
    await harness.pipeline.evaluateAll(widened, "silent");

    const listing = harness.repos.listings.active()[0]!;
    expect(harness.repos.profiles.getMatch(listing.id, profile.id)?.notifiedAt).not.toBeNull();
    expect(harness.published).toHaveLength(1);
  });

  it("adopts newly matching listings silently when a profile is widened", async () => {
    // A profile too strict to match anything, so the first run pushes nothing.
    const profile = addProfile(harness);
    const strict = {
      ...profile,
      preferences: { ...profile.preferences, price: { ...profile.preferences.price, maxTotal: 500 } },
    };
    harness.repos.profiles.update(strict);
    addSource(harness, "fake");
    const adapter = fakeAdapter("fake", () => batch);

    await runOnce(harness, adapter);
    const before = harness.published.length;
    const listing = harness.repos.listings.active()[0]!;
    expect(harness.repos.profiles.getMatch(listing.id, profile.id)?.matched).toBe(false);

    const widened = {
      ...strict,
      preferences: { ...strict.preferences, price: { ...strict.preferences.price, maxTotal: 9000 } },
    };
    harness.repos.profiles.update(widened);
    await harness.pipeline.evaluateAll(widened, "silent");

    // Newly matching, adopted as already notified, with no summary and no per listing push.
    const match = harness.repos.profiles.getMatch(listing.id, profile.id);
    expect(match?.matched).toBe(true);
    expect(match?.notifiedAt).not.toBeNull();
    expect(harness.published).toHaveLength(before);
    expect(harness.repos.outreach.listDrafts("staged").length).toBeGreaterThan(0);

    // Running the source again must not push either.
    await runOnce(harness, adapter);
    expect(harness.published).toHaveLength(before);

    // A later price drop still reaches the owner.
    batch = [unit({ price: 2500 })];
    await runOnce(harness, adapter);
    expect(harness.published.at(-1)?.title).toContain("Price drop");
  });
});

describe("invalid adapter output", () => {
  it("drops what does not fit the contract and keeps the rest", async () => {
    addProfile(harness);
    addSource(harness, "fake");
    // NaN satisfies the TypeScript type but fails RawListingSchema, which is what the guard is for.
    const adapter = fakeAdapter("fake", () => [unit(), unit({ sourceListingId: "broken", price: Number.NaN })]);

    await runOnce(harness, adapter);
    expect(harness.repos.listings.active()).toHaveLength(1);
  });
});
