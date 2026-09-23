import { RawListingSchema } from "@housing/shared";
import { describe, expect, it } from "vitest";
import { parseApartmentListSearch } from "../src/adapters/apartmentlist.ts";
import { parseAppfolioListings, parseAppfolioMarkers } from "../src/adapters/appfolio.ts";
import { stripStatusPrefix } from "../src/adapters/redfin.ts";
import {
  cardsToListings,
  parseMarketplaceCards,
  parseMarketplaceItem,
  marketplaceSearchUrl,
} from "../src/adapters/facebook-marketplace.ts";
import {
  isSeekingPost,
  parseGroupFeedToListings,
  parseJoinedGroups,
  parsePermalink,
  selectGroupsForRun,
} from "../src/adapters/facebook-groups.ts";
import { parseRedfinRentals, redfinPhotoUrls } from "../src/adapters/redfin.ts";
import { parseRentcomSearch } from "../src/adapters/rentcom.ts";
import { parseZumperSearch, zumperSearchUrl } from "../src/adapters/zumper.ts";
import { adapters } from "../src/adapters/index.ts";
import { SourceLayoutError } from "../src/types.ts";
import { fixture, fixtureJson } from "./fixture.ts";

describe("adapter registry", () => {
  it("exposes every adapter with a unique id and the pinned intervals", () => {
    const ids = adapters.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining([
        "craigslist",
        "jhu-och",
        "appfolio",
        "rentcom",
        "apartmentlist",
        "zumper",
        "redfin",
        "facebook-marketplace",
        "facebook-groups",
      ]),
    );
    const byId = new Map(adapters.map((a) => [a.id, a]));
    expect(byId.get("craigslist")?.defaultIntervalSec).toBe(120);
    expect(byId.get("jhu-och")?.defaultIntervalSec).toBe(180);
    expect(byId.get("appfolio")?.defaultIntervalSec).toBe(300);
    expect(byId.get("rentcom")?.defaultIntervalSec).toBe(600);
    expect(byId.get("apartmentlist")?.defaultIntervalSec).toBe(600);
    expect(byId.get("zumper")?.defaultIntervalSec).toBe(600);
    expect(byId.get("redfin")?.defaultIntervalSec).toBe(600);
    expect(byId.get("facebook-marketplace")?.defaultIntervalSec).toBe(900);
    expect(byId.get("facebook-groups")?.defaultIntervalSec).toBe(1800);
  });

  it("keeps both account sources off by default", () => {
    for (const id of ["facebook-marketplace", "facebook-groups"]) {
      const adapter = adapters.find((a) => a.id === id);
      expect(adapter?.kind).toBe("account");
      expect(adapter?.defaultEnabled).toBe(false);
    }
  });
});

describe("redfin descriptions", () => {
  it("drops the Property Status prefix and keeps everything else", () => {
    expect(stripStatusPrefix("Property Status: Active Ideal Student Housing near campus.")).toBe(
      "Ideal Student Housing near campus.",
    );
    expect(stripStatusPrefix("Sunny 4 bedroom.")).toBe("Sunny 4 bedroom.");
    expect(stripStatusPrefix("Property Status: Active")).toBeNull();
    expect(stripStatusPrefix(null)).toBeNull();
  });
});

describe("appfolio", () => {
  const html = fixture("appfolio", "listings.html");
  const listings = parseAppfolioListings(html, "americanmanagement");

  it("joins the Google Map markers to the listing blocks for coordinates", () => {
    const markers = parseAppfolioMarkers(html);
    expect(markers.size).toBe(3);
    expect(listings).toHaveLength(3);
    expect(listings[0]?.lat).toBeCloseTo(39.325762, 5);
    expect(listings[0]?.lon).toBeCloseTo(-76.6144061, 5);
  });

  it("names the landlord from the page title, not the subdomain", () => {
    expect(listings[0]?.contact?.company).toBe("American Management");
    expect(parseAppfolioListings("<html><title></title><body></body></html>", "acme")).toEqual([]);
  });

  it("namespaces the listing id by subdomain so two landlords never collide", () => {
    expect(listings[0]?.sourceListingId).toBe(
      "americanmanagement:4f6cdbea-f669-456b-9db7-969f01ad19a0",
    );
    expect(listings[0]?.url).toBe(
      "https://americanmanagement.appfolio.com/listings/detail/4f6cdbea-f669-456b-9db7-969f01ad19a0",
    );
  });

  it("reads rent, beds, baths and address from the quick-facts list", () => {
    expect(listings[0]?.price).toBe(1495);
    expect(listings[0]?.beds).toBe(3);
    expect(listings[0]?.baths).toBe(1);
    expect(listings[0]?.address).toBe("3043 N Calvert St, A2, Baltimore, MD 21218");
  });

  it("drops the impossible square footage the landlord typed", () => {
    // The page says "Square Feet: 21.42" for a three-bedroom apartment.
    expect(html).toContain("21.42");
    expect(listings[0]?.sqft).toBeNull();
  });

  it("leaves priceBasis null, because AppFolio never states the rent basis", () => {
    for (const listing of listings) expect(listing.priceBasis).toBeUndefined();
  });

  it("throws SourceLayoutError when listing blocks exist but none parse", () => {
    expect(() =>
      parseAppfolioListings('<div class="js-listing-item"></div>', "someone"),
    ).toThrow(SourceLayoutError);
  });
});

describe("rentcom", () => {
  const listings = parseRentcomSearch(fixture("rentcom", "search.html"));

  it("joins filterMatchResults so beds and price match the searched bedroom count", () => {
    expect(listings).toHaveLength(3);
    expect(listings[0]?.sourceListingId).toBe("lc5895393");
    expect(listings[0]?.beds).toBe(4);
    expect(listings[0]?.price).toBe(2720);
    expect(listings[0]?.baths).toBe(4);
    expect(listings[0]?.sqft).toBe(1625);
  });

  it("uses the full address and builds the rent.com URL", () => {
    expect(listings[0]?.address).toBe("521 Saint Paul St, Baltimore, MD 21202");
    expect(listings[0]?.zip).toBe("21202");
    expect(listings[0]?.url).toBe(
      "https://www.rent.com/apartment/521-st-paul-street-baltimore-md-lc5895393",
    );
  });

  it("builds photo URLs from the optimized photo ids", () => {
    expect(listings[0]?.photos?.[0]).toMatch(/^https:\/\/i\.rent\.com\/t_3x2_fixed_webp_lg\/\w+$/);
  });

  it("reads the management company name out of the nested object", () => {
    expect(listings[1]?.contact?.company).toBe("Zahlco Development");
  });

  it("leaves bedsMax null when the matched slice is a single bedroom count", () => {
    // A four-bedroom search collapses filterMatchResults to beds 4 to 4.
    expect(listings[0]?.bedsMax).toBeNull();
  });

  it("reads income restriction from the empty array the site sends", () => {
    expect(listings[0]?.incomeRestricted).toBe(false);
  });

  it("leaves priceBasis null, because rent.com never states the rent basis", () => {
    for (const listing of listings) expect(listing.priceBasis).toBeUndefined();
  });

  it("throws SourceLayoutError when __NEXT_DATA__ is missing", () => {
    expect(() => parseRentcomSearch("<html></html>")).toThrow(SourceLayoutError);
  });
});

describe("apartmentlist", () => {
  const listings = parseApartmentListSearch(fixture("apartmentlist", "search.html"));

  it("keeps one row per bedroom bucket rather than one row per building with a range", () => {
    // Each bucket price is that bed count's actual rent. Collapsing the building into one
    // row would pair a studio price with a three-bedroom bedsMax and lose the middle rents.
    const forBuilding = listings.filter((l) => l.sourceListingId.startsWith("p434658#"));
    expect(forBuilding.length).toBeGreaterThan(1);
    for (const row of forBuilding) expect(row.bedsMax).toBeUndefined();
  });

  it("emits one row per bedroom bucket that carries a price", () => {
    expect(listings.length).toBeGreaterThan(3);
    const first = listings.find((l) => l.sourceListingId === "p434658#1");
    expect(first?.beds).toBe(1);
    expect(first?.price).toBe(1915);
    expect(first?.title).toBe("Elkridge Estates (1 bed)");
  });

  it("reads coordinates from the streamed RSC payload", () => {
    const first = listings.find((l) => l.sourceListingId === "p434658#1");
    expect(first?.lat).toBeCloseTo(39.374043, 5);
    expect(first?.lon).toBeCloseTo(-76.633925, 5);
  });

  it("joins the ld+json Product list for the photo", () => {
    const first = listings.find((l) => l.sourceListingId === "p434658#1");
    expect(first?.photos?.[0]).toContain("cdn.apartmentlist.com");
  });

  it("throws SourceLayoutError when the RSC payload is absent", () => {
    expect(() => parseApartmentListSearch("<html></html>")).toThrow(SourceLayoutError);
  });
});

describe("zumper", () => {
  const listings = parseZumperSearch(fixture("zumper", "search.html"));

  it("reads listables out of window.__PRELOADED_STATE__", () => {
    expect(listings).toHaveLength(3);
    expect(listings[0]?.sourceListingId).toBe("63848879");
    expect(listings[0]?.title).toBe("Four Bedroom Townhouse A");
    expect(listings[0]?.beds).toBe(4);
    expect(listings[0]?.address).toBe("906 N Caroline St");
    expect(listings[0]?.zip).toBe("21205");
    expect(listings[0]?.neighborhood).toBe("Gay Street");
  });

  it("treats the Long.MAX_VALUE sentinel in min_square_feet as unknown", () => {
    expect(fixture("zumper", "search.html")).toContain("9223372036854776000");
    expect(listings[0]?.sqft).toBeNull();
  });

  it("builds photo URLs from the image ids", () => {
    expect(listings[0]?.photos?.[0]).toBe("https://img.zumpercdn.com/885246095/1280x960");
  });

  it("leaves bedsMax null when min and max bedrooms agree", () => {
    expect(listings[0]?.beds).toBe(4);
    expect(listings[0]?.bedsMax).toBeNull();
  });

  it("narrows the search to the bounding box with the box parameter", () => {
    const url = zumperSearchUrl(
      "baltimore-md",
      { minLat: 39.3009, minLon: -76.6555, maxLat: 39.3589, maxLon: -76.5855 },
      4,
    );
    expect(url).toBe(
      "https://www.zumper.com/apartments-for-rent/baltimore-md/4+beds?box=-76.6555,39.3009,-76.5855,39.3589",
    );
  });

  it("leaves priceBasis null, because Zumper never states the rent basis", () => {
    for (const listing of listings) expect(listing.priceBasis).toBeUndefined();
  });

  it("throws SourceLayoutError when the preloaded state is missing", () => {
    expect(() => parseZumperSearch("<html></html>")).toThrow(SourceLayoutError);
  });
});

describe("redfin", () => {
  const listings = parseRedfinRentals(fixtureJson("redfin", "rentals.json"));

  it("maps the rental extension onto the listing", () => {
    expect(listings).toHaveLength(5);
    expect(listings[0]?.sourceListingId).toBe("122a8149-d440-47e6-8a14-74fa3e480dcc");
    expect(listings[0]?.title).toBe("3913 Ednor Rd");
    expect(listings[0]?.price).toBe(600);
    expect(listings[0]?.beds).toBe(4);
    expect(listings[0]?.baths).toBe(2);
    expect(listings[0]?.sqft).toBe(1760);
    expect(listings[0]?.zip).toBe("21218");
    expect(listings[0]?.lat).toBeCloseTo(39.3355235, 6);
  });

  it("builds an absolute URL from the relative path", () => {
    expect(listings[0]?.url).toBe(
      "https://www.redfin.com/MD/Baltimore/3913-Ednor-Rd-21218/home/10826096",
    );
  });

  it("expands photo position ranges into CDN URLs", () => {
    expect(
      redfinPhotoUrls("abc", [
        { startPos: 0, endPos: 0, version: "7" },
        { startPos: 1, endPos: 2, version: "5" },
      ]),
    ).toEqual([
      "https://ssl.cdn-redfin.com/photo/rent/abc/islphoto/genIsl.0_7.jpg",
      "https://ssl.cdn-redfin.com/photo/rent/abc/islphoto/genIsl.1_5.jpg",
      "https://ssl.cdn-redfin.com/photo/rent/abc/islphoto/genIsl.2_5.jpg",
    ]);
  });

  it("sets bedsMax and priceMax for a building with several floor plans", () => {
    const carlyle = listings.find((l) => l.title === "The Carlyle Apartment Homes");
    // The smallest plan is a studio, which is zero bedrooms, not an unknown bedroom count.
    expect(carlyle?.beds).toBe(0);
    expect(carlyle?.bedsMax).toBe(3);
    expect(carlyle?.price).toBe(1600);
    expect(carlyle?.priceMax).toBe(3545);
  });

  it("leaves bedsMax null for a single unit whose range has one value", () => {
    expect(listings[0]?.beds).toBe(4);
    expect(listings[0]?.bedsMax).toBeNull();
  });

  it("carries income restriction and senior housing when Redfin states them", () => {
    expect(listings[0]?.incomeRestricted).toBe(false);
    expect(listings[0]?.seniorHousing).toBe(false);
    const restricted = listings.find((l) => l.incomeRestricted === true);
    expect(restricted?.title).toBe("Penn Square I");
    expect(restricted?.seniorHousing).toBe(false);
  });

  it("leaves priceBasis null, because Redfin never states the rent basis", () => {
    for (const listing of listings) expect(listing.priceBasis).toBeUndefined();
  });

  it("throws SourceLayoutError when homes is missing", () => {
    expect(() => parseRedfinRentals({ notHomes: [] })).toThrow(SourceLayoutError);
  });
});

describe("facebook marketplace", () => {
  const html = fixture("facebook-marketplace", "search.html");
  const listings = cardsToListings(html);

  it("reads cards from the item anchor rather than from generated class names", () => {
    const cards = parseMarketplaceCards(html);
    expect(cards).toHaveLength(3);
    expect(cards[0]).toMatchObject({
      itemId: "2048844099156464",
      title: "4 Beds 2 Baths Townhouse",
      price: 2500,
      location: "Baltimore, MD",
    });
  });

  it("ignores the badge span when picking the title and location", () => {
    expect(html).toContain("Just listed");
    expect(listings[0]?.title).toBe("4 Beds 2 Baths Townhouse");
    expect(listings[0]?.address).toBe("Baltimore, MD");
  });

  it("merges coordinates from the Relay payload", () => {
    expect(listings[0]?.lat).toBeCloseTo(39.304767745199, 6);
    expect(listings[0]?.lon).toBeCloseTo(-76.664580917498, 6);
  });

  it("pulls beds and baths out of the card title", () => {
    expect(listings[1]?.beds).toBe(4);
    expect(listings[1]?.baths).toBe(3);
    expect(listings[2]?.propertyType).toBe("room");
  });

  it("builds a search URL from the area, not from a hardcoded city", () => {
    const url = new URL(marketplaceSearchUrl({ lat: 38.893, lon: -77.019 }, 2, 4));
    expect(url.pathname).toBe("/marketplace/category/propertyrentals");
    expect(url.searchParams.get("latitude")).toBe("38.893");
    expect(url.searchParams.get("longitude")).toBe("-77.019");
    expect(url.searchParams.get("radius")).toBe("2");
    expect(url.searchParams.get("minBedrooms")).toBe("4");
    expect(url.searchParams.get("sortBy")).toBe("creation_time_descend");
  });

  it("takes the unredacted address and the full text from the item page's og tags", () => {
    const enriched = parseMarketplaceItem(fixture("facebook-marketplace", "item.html"), listings[1]!);
    expect(enriched.address).toBe("524 N Chester St, Baltimore, MD 21205-2302, United States");
    expect(enriched.description).toContain("Johns Hopkins Hospital");
    expect(enriched.sqft).toBe(3000);
  });
});

describe("facebook groups", () => {
  const listings = parseGroupFeedToListings(fixture("facebook-groups", "feed.html"));

  it("reads both permalink shapes", () => {
    expect(parsePermalink("/groups/abc/posts/123/")).toEqual({ groupId: "abc", postId: "123" });
    expect(parsePermalink("/groups/abc/?multi_permalinks=456")).toEqual({
      groupId: "abc",
      postId: "456",
    });
    expect(parsePermalink("/groups/abc/")).toBeNull();
  });

  it("drops posts that are seeking housing rather than offering it", () => {
    expect(isSeekingPost("ISO a room near campus")).toBe(true);
    expect(isSeekingPost("Looking for a room starting in January")).toBe(true);
    expect(isSeekingPost("Passing down our 6BR rowhome")).toBe(false);
    expect(listings.map((l) => l.sourceListingId)).toEqual([
      "1000000000000001",
      "1000000000000002",
    ]);
  });

  it("uses the first line cut to 100 characters as the title and the full text as the description", () => {
    expect(listings[0]?.title.length).toBeLessThanOrEqual(100);
    expect(listings[0]?.description).toContain("Lease starts June 1");
  });

  it("takes the author as the contact name and the permalink as the form URL", () => {
    expect(listings[0]?.contact?.name).toBe("Sam Example");
    expect(listings[0]?.contact?.formUrl).toBe(
      "https://www.facebook.com/groups/examplecampushousing/posts/1000000000000001/",
    );
  });

  it("pulls price, beds and address only when the pattern is unambiguous", () => {
    expect(listings[0]?.price).toBe(4200);
    expect(listings[0]?.beds).toBe(6);
    expect(listings[0]?.address).toBe("100 Example Street");
    expect(listings[1]?.address).toBeNull();
  });

  it("flags a sublet post", () => {
    expect(listings[0]?.isSublet).toBe(false);
    expect(listings[1]?.isSublet).toBe(true);
  });

  it("reads the post time from either the time element or the utime attribute", () => {
    expect(listings[0]?.postedAt).toBe("2026-09-19T14:05:00.000Z");
    expect(listings[1]?.postedAt).toBe("2026-09-18T02:53:20.000Z");
  });

  it("keeps only joined groups whose names read like housing groups", () => {
    const groups = parseJoinedGroups(fixture("facebook-groups", "joined-groups.html"));
    expect(groups.map((g) => g.id)).toEqual([
      "examplecampushousing",
      "hopkinsroommates",
      "jhuoffcampus",
    ]);
    expect(groups[0]?.url).toBe("https://www.facebook.com/groups/examplecampushousing");
  });

  it("rotates through at most three groups per run", () => {
    const groups = ["a", "b", "c", "d", "e"];
    expect(selectGroupsForRun(groups, 0)).toEqual(["a", "b", "c"]);
    expect(selectGroupsForRun(groups, 3)).toEqual(["d", "e", "a"]);
    expect(selectGroupsForRun(["a", "b"], 0)).toEqual(["a", "b"]);
  });
});

describe("every parser emits rows the shared schema accepts", () => {
  const cases: Array<[string, () => unknown[]]> = [
    ["appfolio", () => parseAppfolioListings(fixture("appfolio", "listings.html"), "americanmanagement")],
    ["rentcom", () => parseRentcomSearch(fixture("rentcom", "search.html"))],
    ["apartmentlist", () => parseApartmentListSearch(fixture("apartmentlist", "search.html"))],
    ["zumper", () => parseZumperSearch(fixture("zumper", "search.html"))],
    ["redfin", () => parseRedfinRentals(fixtureJson("redfin", "rentals.json"))],
    ["facebook-marketplace", () => cardsToListings(fixture("facebook-marketplace", "search.html"))],
    ["facebook-groups", () => parseGroupFeedToListings(fixture("facebook-groups", "feed.html"))],
  ];

  for (const [name, run] of cases) {
    it(name, () => {
      const rows = run();
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        const result = RawListingSchema.safeParse(row);
        expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
      }
    });
  }
});
