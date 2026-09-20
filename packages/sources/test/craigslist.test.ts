import { describe, expect, it } from "vitest";
import {
  decodeCraigslistItem,
  parseCraigslistDetail,
  parseCraigslistSearch,
} from "../src/adapters/craigslist.ts";
import { SourceLayoutError } from "../src/types.ts";
import { fixture, fixtureJson } from "./fixture.ts";

const search = fixtureJson("craigslist", "search.json");

describe("craigslist delta decode", () => {
  const base = {
    minPostingId: 7951989733,
    minPostedDate: 1786053598,
    locationDescriptions: [0, "Station North", "Baltimore"] as Array<string | number>,
  };

  it("adds the id and date deltas to the decode base", () => {
    const row = decodeCraigslistItem(
      [16584467, 3684964, 1, 600, "1:1~39.3127~-76.581", "0t20CI", [6, "a-slug"], [5, 4, 0], "A title"],
      base,
    );
    expect(row.postingId).toBe(7968574200);
    expect(row.postedAt).toBe("2026-09-18T13:36:02.000Z");
  });

  it("reads position, neighborhood index, beds and sqft out of the packed fields", () => {
    const row = decodeCraigslistItem(
      [1, 2, 1, 3100, "1:1~39.308~-76.609", "09G07a", [6, "slug"], [5, 4, 1820], "Rowhome"],
      base,
    );
    expect(row.lat).toBe(39.308);
    expect(row.lon).toBe(-76.609);
    expect(row.neighborhood).toBe("Station North");
    expect(row.beds).toBe(4);
    expect(row.sqft).toBe(1820);
    expect(row.title).toBe("Rowhome");
  });

  it("finds tagged sub-arrays wherever they sit, since their positions move", () => {
    const withImages = decodeCraigslistItem(
      [1, 2, 1, 900, "1:0~39.3~-76.6", "x", [2, 0], [13, "tok"], [4, "3:00J0J_abc_0t2"], [6, "slug"], [10, "$900"], "Title", [5, 5, 0]],
      base,
    );
    expect(withImages.photos).toEqual([
      "https://images.craigslist.org/00J0J_abc_0t2_600x450.jpg",
    ]);
    expect(withImages.beds).toBe(5);
    expect(withImages.title).toBe("Title");

    const withoutImages = decodeCraigslistItem(
      [1, 2, 1, 900, "1:0~39.3~-76.6", 0, [13, "tok"], [6, "slug"], [10, "$900"], "No photos", [5, 4, 0]],
      base,
    );
    expect(withoutImages.photos).toEqual([]);
    expect(withoutImages.title).toBe("No photos");
  });

  it("throws SourceLayoutError when the leading deltas are not numbers", () => {
    expect(() => decodeCraigslistItem(["nope", 2], base)).toThrow(SourceLayoutError);
  });
});

describe("parseCraigslistSearch", () => {
  const listings = parseCraigslistSearch(search, { site: "baltimore" });

  it("stops at firstNearbyResultId so out-of-area filler is dropped", () => {
    // The fixture holds five in-area rows followed by two nearby rows.
    expect(listings).toHaveLength(5);
    expect(listings.map((l) => l.sourceListingId)).not.toContain("7952768834");
  });

  it("builds the detail URL from the site subdomain, the slug and the posting id", () => {
    expect(listings[1]?.url).toBe(
      "https://baltimore.craigslist.org/apa/d/baltimore-great-value-br-ba-remodeled/7967360136.html",
    );
  });

  it("maps price, beds, sqft, coordinates and neighborhood", () => {
    const row = listings[1];
    expect(row?.price).toBe(3100);
    expect(row?.beds).toBe(4);
    expect(row?.sqft).toBe(1820);
    expect(row?.lat).toBe(39.308);
    expect(row?.lon).toBe(-76.609);
    expect(row?.neighborhood).toBe("Station North");
    expect(row?.propertyType).toBe("rowhome");
  });

  it("points contact.formUrl at the listing, never at a reply URL", () => {
    for (const listing of listings) {
      expect(listing.contact?.formUrl).toBe(listing.url);
      expect(listing.contact?.formUrl).not.toContain("/reply/");
    }
  });

  it("builds photo URLs from the image tokens", () => {
    expect(listings[1]?.photos?.[0]).toBe(
      "https://images.craigslist.org/01212_1EvFfPofixc_09G07a_600x450.jpg",
    );
  });

  it("throws SourceLayoutError when the decode block is missing", () => {
    expect(() => parseCraigslistSearch({ data: { items: [] } }, { site: "baltimore" })).toThrow(
      SourceLayoutError,
    );
  });
});

describe("parseCraigslistDetail", () => {
  const base = parseCraigslistSearch(search, { site: "baltimore" })[1];
  const detail = parseCraigslistDetail(fixture("craigslist", "detail.html"), base!);

  it("reads the posting body as the description", () => {
    expect(detail.description).toContain("NEWLY RENOVATED, ultra-modern 4 Bedroom, 3.5 Bath loft");
    expect(detail.description).not.toContain("QR Code Link");
  });

  it("takes baths from the attribute row and coordinates from the ld+json block", () => {
    expect(detail.baths).toBe(3.5);
    expect(detail.lat).toBe(39.307997);
    expect(detail.lon).toBe(-76.60897);
    expect(detail.address).toBe("Federal St");
    expect(detail.zip).toBe("21202");
  });

  it("maps the attribute labels to amenities", () => {
    expect(detail.amenities).toMatchObject({
      airConditioning: true,
      furnished: true,
      catsAllowed: true,
      dogsAllowed: true,
    });
  });
});
