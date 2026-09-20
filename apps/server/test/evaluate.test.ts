import { FILTER_REASONS, type FilterReason } from "@housing/shared";
import { describe, expect, it } from "vitest";
import {
  amenityScore,
  distanceScore,
  evaluate,
  freshnessScore,
  perPersonPrice,
  priceScore,
  resolveBedPlan,
  sizeScore,
} from "../src/match/evaluate.ts";
import { HOMEWOOD, makeListing, makePreferences, makeProfile, NOW } from "./helpers.ts";

function reasonsFor(listing: Parameters<typeof evaluate>[0], profile: Parameters<typeof evaluate>[1]): FilterReason[] {
  return evaluate(listing, profile, NOW).rejectedBy;
}

describe("hard filters", () => {
  it("passes a listing that satisfies a default profile", () => {
    const match = evaluate(makeListing(), makeProfile(), NOW);
    expect(match.matched).toBe(true);
    expect(match.rejectedBy).toEqual([]);
  });

  it("fires priceOverMax on the total", () => {
    const profile = makeProfile(makePreferences((p) => ({ ...p, price: { ...p.price, maxTotal: 2500 } })));
    expect(reasonsFor(makeListing({ price: 3000 }), profile)).toContain("priceOverMax");
  });

  it("fires priceOverMax on the per person share", () => {
    const profile = makeProfile(
      makePreferences((p) => ({ ...p, group: { size: 2 }, price: { ...p.price, maxPerPerson: 800 } })),
    );
    expect(reasonsFor(makeListing({ price: 3000 }), profile)).toContain("priceOverMax");
  });

  it("fires priceUnknown only when unknown prices are not allowed", () => {
    const allowed = makeProfile();
    expect(reasonsFor(makeListing({ price: null }), allowed)).not.toContain("priceUnknown");
    const strict = makeProfile(makePreferences((p) => ({ ...p, price: { ...p.price, allowUnknown: false } })));
    expect(reasonsFor(makeListing({ price: null }), strict)).toContain("priceUnknown");
  });

  it("fires bedsOutOfRange below the minimum and above the maximum", () => {
    const profile = makeProfile(makePreferences((p) => ({ ...p, beds: { ...p.beds, min: 4, max: 6 } })));
    expect(reasonsFor(makeListing({ beds: 3 }), profile)).toContain("bedsOutOfRange");
    expect(reasonsFor(makeListing({ beds: 7 }), profile)).toContain("bedsOutOfRange");
    expect(reasonsFor(makeListing({ beds: 5 }), profile)).not.toContain("bedsOutOfRange");
  });

  it("fires bedsUnknown by default and clears it when unknown beds are allowed", () => {
    expect(reasonsFor(makeListing({ beds: null }), makeProfile())).toContain("bedsUnknown");
    const lenient = makeProfile(makePreferences((p) => ({ ...p, beds: { ...p.beds, allowUnknown: true } })));
    expect(reasonsFor(makeListing({ beds: null }), lenient)).not.toContain("bedsUnknown");
  });

  it("fires bathsUnderMin", () => {
    const profile = makeProfile(makePreferences((p) => ({ ...p, baths: { min: 2 } })));
    expect(reasonsFor(makeListing({ baths: 1 }), profile)).toContain("bathsUnderMin");
    expect(reasonsFor(makeListing({ baths: null }), profile)).not.toContain("bathsUnderMin");
  });

  it("fires sqftUnderMin", () => {
    const profile = makeProfile(makePreferences((p) => ({ ...p, sqft: { min: 2000 } })));
    expect(reasonsFor(makeListing({ sqft: 1800 }), profile)).toContain("sqftUnderMin");
    expect(reasonsFor(makeListing({ sqft: null }), profile)).not.toContain("sqftUnderMin");
  });

  it("fires propertyTypeNotAllowed", () => {
    const profile = makeProfile(makePreferences((p) => ({ ...p, propertyTypes: ["apartment"] })));
    expect(reasonsFor(makeListing({ propertyType: "rowhome" }), profile)).toContain("propertyTypeNotAllowed");
  });

  it("fires tooFar past the walk limit", () => {
    const profile = makeProfile(
      makePreferences((p) => ({ ...p, location: { ...p.location, maxWalkMinutes: 5, idealWalkMinutes: 2 } })),
    );
    expect(reasonsFor(makeListing(), profile)).toContain("tooFar");
  });

  it("fires locationUnknown unless unknown locations are allowed", () => {
    expect(reasonsFor(makeListing({ lat: null, lon: null }), makeProfile())).toContain("locationUnknown");
    const lenient = makeProfile(
      makePreferences((p) => ({ ...p, location: { ...p.location, allowUnknown: true } })),
    );
    expect(reasonsFor(makeListing({ lat: null, lon: null }), lenient)).not.toContain("locationUnknown");
  });

  it("fires neighborhoodExcluded and neighborhoodNotIncluded", () => {
    const excluded = makeProfile(
      makePreferences((p) => ({ ...p, location: { ...p.location, neighborhoodsExclude: ["charles village"] } })),
    );
    expect(reasonsFor(makeListing(), excluded)).toContain("neighborhoodExcluded");

    const included = makeProfile(
      makePreferences((p) => ({ ...p, location: { ...p.location, neighborhoodsInclude: ["Hampden"] } })),
    );
    expect(reasonsFor(makeListing(), included)).toContain("neighborhoodNotIncluded");
    expect(reasonsFor(makeListing({ neighborhood: null }), included)).toContain("neighborhoodNotIncluded");
  });

  it("fires availabilityOutsideWindow on both ends", () => {
    const profile = makeProfile(
      makePreferences((p) => ({
        ...p,
        dates: { ...p.dates, moveInEarliest: "2027-05-01", moveInLatest: "2027-07-01" },
      })),
    );
    expect(reasonsFor(makeListing({ availableDate: "2027-04-01" }), profile)).toContain("availabilityOutsideWindow");
    expect(reasonsFor(makeListing({ availableDate: "2027-08-01" }), profile)).toContain("availabilityOutsideWindow");
    expect(reasonsFor(makeListing({ availableDate: "2027-06-01" }), profile)).not.toContain(
      "availabilityOutsideWindow",
    );
  });

  it("fires availabilityUnknown only when a window is set and unknown dates are refused", () => {
    const profile = makeProfile(
      makePreferences((p) => ({
        ...p,
        dates: { ...p.dates, moveInEarliest: "2027-05-01", allowUnknown: false },
      })),
    );
    expect(reasonsFor(makeListing({ availableDate: null }), profile)).toContain("availabilityUnknown");
    const noWindow = makeProfile(makePreferences((p) => ({ ...p, dates: { ...p.dates, allowUnknown: false } })));
    expect(reasonsFor(makeListing({ availableDate: null }), noWindow)).not.toContain("availabilityUnknown");
  });

  it("fires leaseLengthOutOfRange", () => {
    const profile = makeProfile(
      makePreferences((p) => ({ ...p, dates: { ...p.dates, leaseMonthsMin: 10, leaseMonthsMax: 14 } })),
    );
    expect(reasonsFor(makeListing({ leaseMonths: 6 }), profile)).toContain("leaseLengthOutOfRange");
    expect(reasonsFor(makeListing({ leaseMonths: 24 }), profile)).toContain("leaseLengthOutOfRange");
    expect(reasonsFor(makeListing({ leaseMonths: null }), profile)).not.toContain("leaseLengthOutOfRange");
  });

  it("fires missingRequiredAmenity", () => {
    const profile = makeProfile(
      makePreferences((p) => ({ ...p, amenities: { ...p.amenities, laundryInUnit: "must" } })),
    );
    expect(reasonsFor(makeListing(), profile)).toContain("missingRequiredAmenity");
    expect(reasonsFor(makeListing({ amenities: { laundryInUnit: true } }), profile)).not.toContain(
      "missingRequiredAmenity",
    );
  });

  it("fires subletNotAllowed and sharedRoomNotAllowed", () => {
    expect(reasonsFor(makeListing({ isSublet: true }), makeProfile())).toContain("subletNotAllowed");
    const roomProfile = makeProfile(
      makePreferences((p) => ({ ...p, propertyTypes: [...p.propertyTypes, "room"] })),
    );
    expect(reasonsFor(makeListing({ propertyType: "room" }), roomProfile)).toContain("sharedRoomNotAllowed");
  });

  it("fires incomeRestricted and seniorHousing from the canonical flags", () => {
    expect(reasonsFor(makeListing({ incomeRestricted: true }), makeProfile())).toContain("incomeRestricted");
    expect(reasonsFor(makeListing({ seniorHousing: true }), makeProfile())).toContain("seniorHousing");

    const permissive = makeProfile(
      makePreferences((p) => ({
        ...p,
        rules: { ...p.rules, allowIncomeRestricted: true, allowSeniorHousing: true },
      })),
    );
    expect(reasonsFor(makeListing({ incomeRestricted: true, seniorHousing: true }), permissive)).toEqual([]);
  });

  it("fires suspectedScam only while the profile hides them", () => {
    const listing = makeListing({ scamSignals: ["wireOrGiftCardLanguage"] });
    expect(reasonsFor(listing, makeProfile())).toContain("suspectedScam");
    const lenient = makeProfile(makePreferences((p) => ({ ...p, rules: { ...p.rules, hideSuspectedScams: false } })));
    expect(reasonsFor(listing, lenient)).not.toContain("suspectedScam");
  });

  it("fires noPhotos and listingTooOld", () => {
    const needsPhotos = makeProfile(makePreferences((p) => ({ ...p, rules: { ...p.rules, requirePhotos: true } })));
    expect(reasonsFor(makeListing({ photos: [] }), needsPhotos)).toContain("noPhotos");

    const fresh = makeProfile(makePreferences((p) => ({ ...p, rules: { ...p.rules, maxListingAgeDays: 7 } })));
    expect(reasonsFor(makeListing({ postedAt: "2026-08-01T00:00:00.000Z" }), fresh)).toContain("listingTooOld");
  });

  it("fires each exclusion reason and missingRequiredKeyword", () => {
    const listing = makeListing({
      title: "Unit at The Marylander",
      description: "Managed by Morgan Properties. No pets.",
      address: "3501 St Paul St",
    });

    const building = makeProfile(
      makePreferences((p) => ({ ...p, exclusions: { ...p.exclusions, buildings: ["The Marylander"] } })),
    );
    expect(reasonsFor(listing, building)).toContain("excludedBuilding");

    const address = makeProfile(
      makePreferences((p) => ({ ...p, exclusions: { ...p.exclusions, addresses: ["3501 St Paul"] } })),
    );
    expect(reasonsFor(listing, address)).toContain("excludedAddress");

    const landlord = makeProfile(
      makePreferences((p) => ({ ...p, exclusions: { ...p.exclusions, landlords: ["Morgan Properties"] } })),
    );
    expect(reasonsFor(listing, landlord)).toContain("excludedLandlord");

    const keyword = makeProfile(
      makePreferences((p) => ({ ...p, exclusions: { ...p.exclusions, keywords: ["no pets"] } })),
    );
    expect(reasonsFor(listing, keyword)).toContain("excludedKeyword");

    const source = makeProfile(
      makePreferences((p) => ({ ...p, exclusions: { ...p.exclusions, sources: ["demo"] } })),
    );
    expect(reasonsFor(listing, source)).toContain("excludedSource");

    const required = makeProfile(
      makePreferences((p) => ({ ...p, keywords: { ...p.keywords, required: ["central air"] } })),
    );
    expect(reasonsFor(listing, required)).toContain("missingRequiredKeyword");
  });

  it("collects every failing reason rather than stopping at the first", () => {
    const profile = makeProfile(
      makePreferences((p) => ({
        ...p,
        price: { ...p.price, maxTotal: 1000 },
        beds: { ...p.beds, min: 8 },
        propertyTypes: ["condo"],
      })),
    );
    const reasons = reasonsFor(makeListing(), profile);
    expect(reasons).toEqual(expect.arrayContaining(["priceOverMax", "bedsOutOfRange", "propertyTypeNotAllowed"]));
  });

  it("can fire every documented filter reason across the suite", () => {
    // Guards against a reason being added to the contract with no rule behind it.
    const covered = new Set<FilterReason>([
      "priceOverMax",
      "priceUnknown",
      "bedsOutOfRange",
      "bedsUnknown",
      "bathsUnderMin",
      "sqftUnderMin",
      "propertyTypeNotAllowed",
      "tooFar",
      "locationUnknown",
      "neighborhoodExcluded",
      "neighborhoodNotIncluded",
      "availabilityOutsideWindow",
      "availabilityUnknown",
      "leaseLengthOutOfRange",
      "missingRequiredAmenity",
      "subletNotAllowed",
      "sharedRoomNotAllowed",
      "incomeRestricted",
      "seniorHousing",
      "suspectedScam",
      "noPhotos",
      "listingTooOld",
      "excludedBuilding",
      "excludedAddress",
      "excludedLandlord",
      "excludedKeyword",
      "excludedSource",
      "missingRequiredKeyword",
    ]);
    expect([...FILTER_REASONS].filter((r) => !covered.has(r))).toEqual([]);
  });
});

describe("score components", () => {
  it("prices at the documented endpoints", () => {
    expect(priceScore(500, 600, 900)).toBe(100);
    expect(priceScore(600, 600, 900)).toBe(100);
    expect(priceScore(900, 600, 900)).toBe(40);
    expect(priceScore(1200, 600, 900)).toBe(40);
    expect(priceScore(750, 600, 900)).toBe(70);
    expect(priceScore(null, 600, 900)).toBe(60);
  });

  it("scores distance from 100 at the ideal down to 30 at the maximum", () => {
    expect(distanceScore(5, 10, 20)).toBe(100);
    expect(distanceScore(10, 10, 20)).toBe(100);
    expect(distanceScore(20, 10, 20)).toBe(30);
    expect(distanceScore(15, 10, 20)).toBe(65);
    expect(distanceScore(null, 10, 20)).toBe(50);
  });

  it("scores amenities as the preferred share minus the avoided share", () => {
    const preferences = makePreferences((p) => ({
      ...p,
      amenities: { ...p.amenities, laundryInUnit: "prefer", dishwasher: "prefer", gym: "avoid" },
    }));
    expect(amenityScore(makeListing({ amenities: { laundryInUnit: true, dishwasher: true } }), preferences)).toBe(100);
    expect(amenityScore(makeListing({ amenities: { laundryInUnit: true } }), preferences)).toBe(50);
    expect(amenityScore(makeListing({ amenities: {} }), preferences)).toBe(0);
    expect(
      amenityScore(makeListing({ amenities: { laundryInUnit: true, dishwasher: true, gym: true } }), preferences),
    ).toBe(0);
    expect(amenityScore(makeListing(), makePreferences())).toBe(50);
  });

  it("scores size at 100 on the minimum and loses ten per extra bedroom", () => {
    expect(sizeScore(5, 5)).toBe(100);
    expect(sizeScore(6, 5)).toBe(90);
    expect(sizeScore(15, 5)).toBe(0);
    expect(sizeScore(null, 5)).toBe(50);
  });

  it("scores freshness at 100 under an hour and 20 at fourteen days", () => {
    const now = new Date("2026-09-20T12:00:00.000Z");
    expect(freshnessScore("2026-09-20T11:30:00.000Z", now)).toBe(100);
    expect(freshnessScore("2026-09-06T12:00:00.000Z", now)).toBe(20);
    expect(freshnessScore("2026-08-01T12:00:00.000Z", now)).toBe(20);
    const midway = freshnessScore("2026-09-13T12:00:00.000Z", now);
    expect(midway).toBeGreaterThan(20);
    expect(midway).toBeLessThan(100);
  });

  it("caps the keyword boost", () => {
    const profile = makeProfile(
      makePreferences((p) => ({
        ...p,
        keywords: { ...p.keywords, boost: ["row home", "campus", "bright", "guilford"] },
      })),
    );
    expect(evaluate(makeListing(), profile, NOW).breakdown.keywordBoost).toBe(15);
  });
});

describe("per person price", () => {
  it("divides a whole unit by the group size", () => {
    expect(perPersonPrice(3000, "rowhome", 6, 3000)).toBe(500);
  });

  it("uses the listed price for a room, which is already one share", () => {
    expect(perPersonPrice(900, "room", 6, 900)).toBe(900);
  });

  it("returns null when the price is unknown", () => {
    expect(perPersonPrice(null, "rowhome", 6, null)).toBeNull();
  });

  it("reports the per person price on the match", () => {
    const profile = makeProfile(makePreferences((p) => ({ ...p, group: { size: 6 } })));
    expect(evaluate(makeListing({ price: 3000 }), profile, NOW).pricePerPerson).toBe(500);
  });
});

describe("bed ranges", () => {
  const building = makeListing({ beds: 1, bedsMax: 4, price: 1500, priceMax: 4200 });

  it("scores the largest plan when the profile wants exactly four beds", () => {
    const plan = resolveBedPlan(building, { min: 4, max: 4 });
    expect(plan.overlaps).toBe(true);
    expect(plan.beds).toBe(4);
    expect(plan.rent).toBe(4200);
  });

  it("scores the smallest plan inside the overlap", () => {
    expect(resolveBedPlan(building, { min: 2, max: null })).toEqual({ beds: 2, rent: 2400, overlaps: true });
    expect(resolveBedPlan(building, { min: 0, max: null })).toEqual({ beds: 1, rent: 1500, overlaps: true });
    expect(resolveBedPlan(building, { min: 3, max: 3 })).toEqual({ beds: 3, rent: 3300, overlaps: true });
  });

  it("reports no overlap when the ranges miss each other", () => {
    expect(resolveBedPlan(building, { min: 5, max: null }).overlaps).toBe(false);
    expect(resolveBedPlan(makeListing({ beds: 6, bedsMax: 8 }), { min: 1, max: 3 }).overlaps).toBe(false);
  });

  it("uses price when priceMax is missing", () => {
    const flat = makeListing({ beds: 1, bedsMax: 4, price: 1500, priceMax: null });
    expect(resolveBedPlan(flat, { min: 4, max: 4 }).rent).toBe(1500);
  });

  it("leaves a single unit row alone", () => {
    expect(resolveBedPlan(makeListing({ beds: 5, price: 3000 }), { min: 4, max: 6 })).toEqual({
      beds: 5,
      rent: 3000,
      overlaps: true,
    });
  });

  it("filters and prices a building on the interpolated rent", () => {
    const wantsFour = makeProfile(
      makePreferences((p) => ({
        ...p,
        group: { size: 4 },
        beds: { ...p.beds, min: 4, max: 4 },
        price: { ...p.price, maxTotal: 4000, maxPerPerson: null, idealPerPerson: null },
      })),
    );
    // The four bed plan rents for 4,200, which is over the profile's total ceiling.
    const match = evaluate(building, wantsFour, NOW);
    expect(match.rejectedBy).toContain("priceOverMax");
    expect(match.pricePerPerson).toBe(1050);

    const wantsTwo = makeProfile(
      makePreferences((p) => ({
        ...p,
        group: { size: 2 },
        beds: { ...p.beds, min: 2, max: 2 },
        price: { ...p.price, maxTotal: 4000 },
      })),
    );
    const cheaper = evaluate(building, wantsTwo, NOW);
    expect(cheaper.rejectedBy).not.toContain("priceOverMax");
    expect(cheaper.pricePerPerson).toBe(1200);
    expect(cheaper.breakdown.size).toBe(100);
  });

  it("rejects a building whose plans miss the profile", () => {
    const wantsSix = makeProfile(makePreferences((p) => ({ ...p, beds: { ...p.beds, min: 6, max: null } })));
    expect(evaluate(building, wantsSix, NOW).rejectedBy).toContain("bedsOutOfRange");
  });
});

describe("per room pricing", () => {
  const perRoom = makeListing({ price: 850, priceBasis: "room", beds: 5, propertyType: "rowhome" });

  it("prices a five bedroom row home at 850 per room for a group of six", () => {
    const profile = makeProfile(makePreferences((p) => ({ ...p, group: { size: 6 } })));
    const match = evaluate(perRoom, profile, NOW);
    expect(match.monthlyTotal).toBe(4250);
    expect(match.pricePerPerson).toBe(708.33);
  });

  it("filters maxTotal on the whole unit rent, not on the room price", () => {
    const tight = makeProfile(
      makePreferences((p) => ({ ...p, group: { size: 6 }, price: { ...p.price, maxTotal: 4000 } })),
    );
    expect(evaluate(perRoom, tight, NOW).rejectedBy).toContain("priceOverMax");

    const roomy = makeProfile(
      makePreferences((p) => ({ ...p, group: { size: 6 }, price: { ...p.price, maxTotal: 4500 } })),
    );
    expect(evaluate(perRoom, roomy, NOW).rejectedBy).not.toContain("priceOverMax");
  });

  it("reports monthlyTotal on a rejected listing too", () => {
    const tight = makeProfile(makePreferences((p) => ({ ...p, price: { ...p.price, maxTotal: 100 } })));
    const match = evaluate(perRoom, tight, NOW);
    expect(match.matched).toBe(false);
    expect(match.monthlyTotal).toBe(4250);
  });

  it("leaves monthlyTotal null when the price is unknown", () => {
    expect(evaluate(makeListing({ price: null }), makeProfile(), NOW).monthlyTotal).toBeNull();
  });

  it("multiplies the interpolated room price for a ranged building", () => {
    const building = makeListing({ beds: 1, bedsMax: 4, price: 400, priceMax: 700, priceBasis: "room" });
    const profile = makeProfile(
      makePreferences((p) => ({ ...p, group: { size: 4 }, beds: { ...p.beds, min: 4, max: 4 } })),
    );
    const match = evaluate(building, profile, NOW);
    expect(match.monthlyTotal).toBe(2800);
    expect(match.pricePerPerson).toBe(700);
  });

  it("gives a single shared room its listed price as the per person price", () => {
    const room = makeListing({ price: 900, propertyType: "room", priceBasis: "unit", beds: 1 });
    const profile = makeProfile(
      makePreferences((p) => ({
        ...p,
        group: { size: 6 },
        propertyTypes: [...p.propertyTypes, "room"],
        rules: { ...p.rules, allowRoomsInSharedUnit: true },
      })),
    );
    const match = evaluate(room, profile, NOW);
    expect(match.monthlyTotal).toBe(900);
    expect(match.pricePerPerson).toBe(900);
  });

  it("leaves a whole unit listing alone", () => {
    const profile = makeProfile(makePreferences((p) => ({ ...p, group: { size: 6 } })));
    const match = evaluate(makeListing({ price: 3000 }), profile, NOW);
    expect(match.monthlyTotal).toBe(3000);
    expect(match.pricePerPerson).toBe(500);
  });
});

describe("weighting", () => {
  it("honours the relative weights", () => {
    const priceHeavy = makeProfile(
      makePreferences((p) => ({
        ...p,
        price: { ...p.price, idealPerPerson: 100, maxPerPerson: 200 },
        weights: { price: 10, distance: 0, amenities: 0, size: 0, freshness: 0 },
      })),
    );
    // Well over the per person maximum, so the price component pins to its floor of 40.
    const match = evaluate(makeListing({ price: 6000 }), priceHeavy, NOW);
    expect(match.breakdown.price).toBe(40);
    expect(match.score).toBe(40);
  });

  it("falls back to an equal mean when every weight is zero", () => {
    const flat = makeProfile(
      makePreferences((p) => ({
        ...p,
        weights: { price: 0, distance: 0, amenities: 0, size: 0, freshness: 0 },
      })),
    );
    const match = evaluate(makeListing(), flat, NOW);
    const mean =
      (match.breakdown.price +
        match.breakdown.distance +
        match.breakdown.amenities +
        match.breakdown.size +
        match.breakdown.freshness) /
      5;
    expect(match.score).toBeCloseTo(Math.round(mean * 10) / 10, 5);
  });

  it("uses a routed walk time when one is supplied", () => {
    const profile = makeProfile();
    const far = makeListing({ lat: 39.3499, lon: -76.6405 });
    const straightLine = evaluate(far, profile, NOW);
    const routed = evaluate(far, profile, NOW, 3);
    expect(straightLine.breakdown.distance).toBeLessThan(100);
    expect(routed.walkMinutes).toBe(3);
    expect(routed.breakdown.distance).toBe(100);
    expect(routed.distanceMiles).toBe(straightLine.distanceMiles);
  });

  it("measures distance from the profile anchor", () => {
    const match = evaluate(makeListing({ lat: HOMEWOOD.lat, lon: HOMEWOOD.lon }), makeProfile(), NOW);
    expect(match.distanceMiles).toBe(0);
    expect(match.walkMinutes).toBe(0);
  });
});
