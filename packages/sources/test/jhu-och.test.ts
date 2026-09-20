import { describe, expect, it } from "vitest";
import {
  DETAIL_BFF_PATTERN,
  SEARCH_BFF_PATTERN,
  bffUrlForPage,
  parseJhuDetailBody,
  parseJhuSearchBody,
  readTransferEntry,
  unescapeTransferState,
} from "../src/adapters/jhu-och.ts";
import { SourceLayoutError } from "../src/types.ts";
import { fixture } from "./fixture.ts";

const searchPage = fixture("jhu-och", "search-page.html");
const detailPage = fixture("jhu-och", "detail-page.html");
const multiPlanPage = fixture("jhu-och", "detail-page-multi-plan.html");

describe("transfer state", () => {
  it("unescapes Angular's five tokens in one pass", () => {
    expect(unescapeTransferState("&q;a&a;b&l;c&g;d&s;e&q;")).toBe(`"a&b<c>d'e"`);
  });

  it("pulls the BFF search URL out of the base64 transfer-state key", () => {
    const entry = readTransferEntry(searchPage, SEARCH_BFF_PATTERN);
    expect(entry.url).toBe(
      "https://offcampushousing.jhu.edu/bff/listing/search/combined?url=%2Fhousing%2Fbeds-4&v=4&seed=3273&locale=en",
    );
  });

  it("pulls the BFF listing URL from a detail page", () => {
    const entry = readTransferEntry(detailPage, DETAIL_BFF_PATTERN);
    expect(entry.url).toBe("https://offcampushousing.jhu.edu/bff/listing/ocp85bhh93?v=5&locale=en");
  });

  it("throws SourceLayoutError when no entry matches", () => {
    expect(() => readTransferEntry(searchPage, /\/bff\/nothing\//)).toThrow(SourceLayoutError);
    expect(() => readTransferEntry("<html></html>", SEARCH_BFF_PATTERN)).toThrow(SourceLayoutError);
  });

  it("pages through path segments, not a query parameter", () => {
    const first =
      "https://offcampushousing.jhu.edu/bff/listing/search/combined?url=%2Fhousing%2Fbeds-4&v=4&seed=3273&locale=en";
    expect(bffUrlForPage(first, 2)).toContain("url=%2Fhousing%2Fbeds-4%2Fpage-2");
    expect(bffUrlForPage(bffUrlForPage(first, 2), 3)).toContain("url=%2Fhousing%2Fbeds-4%2Fpage-3");
  });
});

describe("parseJhuSearchBody", () => {
  const { listings, totalPages } = parseJhuSearchBody(
    readTransferEntry(searchPage, SEARCH_BFF_PATTERN).body,
  );

  it("reads the page count so search knows how far to page", () => {
    expect(totalPages).toBe(2);
    expect(listings).toHaveLength(3);
  });

  it("maps the matching floor plan price and beds", () => {
    const universityView = listings[0];
    expect(universityView?.sourceListingId).toBe("2sbyc3c");
    expect(universityView?.title).toBe("University View");
    expect(universityView?.price).toBe(1209);
    expect(universityView?.priceMax).toBe(1269);
    expect(universityView?.beds).toBe(4);
  });

  it("keeps the College Park row's real distance so the adapter can filter it out", () => {
    // 8204 Baltimore Ave is 34 miles from Homewood; the adapter drops it by distance.
    expect(listings[0]?.lat).toBeCloseTo(38.99269, 5);
    expect(listings[0]?.lon).toBeCloseTo(-76.934345, 5);
  });

  it("treats call-for-price as an unknown price rather than zero", () => {
    const carlyle = listings[1];
    expect(carlyle?.sourceListingId).toBe("ypplxpt");
    expect(carlyle?.price).toBeNull();
    expect(carlyle?.priceMax).toBeNull();
  });

  it("maps address, zip, coordinates, photos and phone", () => {
    const carlyle = listings[1];
    expect(carlyle?.address).toBe("500 W University Pky");
    expect(carlyle?.zip).toBe("21210");
    expect(carlyle?.lat).toBeCloseTo(39.337419, 5);
    expect(carlyle?.photos?.[0]).toMatch(/^https:\/\/images1\.apartments\.com\/i2\//);
    expect(carlyle?.contact?.phone).toMatch(/^\d{10}$/);
  });

  it("reads the per-bedroom rent basis the portal states on every listing", () => {
    // Charles Village Townhouse advertises $495 /Bedroom for a five bedroom house, so the
    // price is one room's rent, not the whole house.
    const townhouse = listings[2];
    expect(townhouse?.priceBasis).toBe("room");
    expect(townhouse?.price).toBe(495);
    expect(townhouse?.beds).toBe(5);

    expect(listings[0]?.priceBasis).toBe("room");
    expect(listings[1]?.priceBasis).toBe("unit");
  });

  it("marks a shared-space listing as a room and builds the absolute profile URL", () => {
    const townhouse = listings[2];
    expect(townhouse?.sourceListingId).toBe("ocpq7qphxy");
    expect(townhouse?.propertyType).toBe("room");
    expect(townhouse?.beds).toBe(5);
    expect(townhouse?.price).toBe(495);
    expect(townhouse?.url).toBe(
      "https://offcampushousing.jhu.edu/housing/property/charles-village-townhouse/ocpq7qphxy",
    );
  });

  it("throws SourceLayoutError when placards are missing", () => {
    expect(() => parseJhuSearchBody({ data: {} })).toThrow(SourceLayoutError);
  });
});

describe("parseJhuDetailBody", () => {
  const base = parseJhuSearchBody(readTransferEntry(searchPage, SEARCH_BFF_PATTERN).body).listings[2];
  const detail = parseJhuDetailBody(readTransferEntry(detailPage, DETAIL_BFF_PATTERN).body, base!);

  it("replaces the title and fills the description", () => {
    expect(detail.title).toBe("$300 PRICE DROP of Completely Renovated Home Right Next to Hopkins");
    expect(detail.description).toContain("Central air, completely gutted to the bone");
  });

  it("reads baths, sqft and the available date off the matching floor plan", () => {
    expect(detail.baths).toBe(3);
    expect(detail.sqft).toBe(1430);
    expect(detail.availableDate).toBe("2026-08-02");
  });

  it("reads the address, neighborhood and coordinates", () => {
    expect(detail.address).toBe("3331 Beech Avenue");
    expect(detail.neighborhood).toBe("Wyman Park");
    expect(detail.zip).toBe("21211");
    expect(detail.lat).toBeCloseTo(39.328076, 5);
    expect(detail.propertyType).toBe("rowhome");
  });

  it("reads the management company and agent as the contact", () => {
    expect(detail.contact?.company).toBe("Example Property Group");
    expect(detail.contact?.name).toBe("Dana Example");
    expect(detail.contact?.formUrl).toBe(base?.url);
  });

  it("maps the amenity groups", () => {
    expect(detail.amenities).toMatchObject({
      airConditioning: true,
      dishwasher: true,
      laundryInUnit: true,
    });
  });

  it("leaves bedsMax null for a single-plan listing", () => {
    expect(detail.beds).toBe(5);
    expect(detail.bedsMax).toBeNull();
  });

  it("reports income restriction from the empty array the site sends", () => {
    expect(detail.incomeRestricted).toBe(false);
  });

  it("reads the rent basis from the detail body", () => {
    expect(detail.priceBasis).toBe("unit");
  });
});

describe("parseJhuDetailBody for a building with several floor plans", () => {
  const placard = parseJhuSearchBody(
    readTransferEntry(searchPage, SEARCH_BFF_PATTERN).body,
  ).listings[1];
  const detail = parseJhuDetailBody(
    readTransferEntry(multiPlanPage, DETAIL_BFF_PATTERN).body,
    placard!,
  );

  it("widens beds and bedsMax to the building's smallest and largest plan", () => {
    // The placard matched a four-bedroom plan; the building runs studio to four bedrooms.
    expect(placard?.beds).toBe(4);
    expect(placard?.bedsMax).toBeNull();
    expect(detail.beds).toBe(0);
    expect(detail.bedsMax).toBe(4);
  });

  it("pairs price with the smallest plan and priceMax with the largest", () => {
    // The placard said call for pricing, so the detail supplies both ends.
    expect(placard?.price).toBeNull();
    expect(detail.price).toBe(1600);
    expect(detail.priceMax).toBe(3545);
  });
});
