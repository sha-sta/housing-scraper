import { describe, expect, it } from "vitest";
import { bboxPolygon, haversineMiles, inArea } from "../src/geo.ts";
import {
  amenitiesFromLabels,
  isoDate,
  normalizePhone,
  parseBedBath,
  parseMoney,
  plausibleSqft,
  propertyTypeFrom,
} from "../src/text.ts";
import type { SearchArea } from "../src/types.ts";

const homewood: SearchArea = {
  center: { lat: 39.3299, lon: -76.6205 },
  radiusMiles: 2,
  bbox: { minLat: 39.3009, minLon: -76.6579, maxLat: 39.3589, maxLon: -76.5831 },
  zips: ["21218", "21211", "21210"],
  neighborhoods: ["Charles Village"],
};

describe("geo", () => {
  it("measures the distance from Homewood to College Park", () => {
    // Straight line. The JHU site quotes 34.16 miles for the same pair, which is road distance.
    expect(haversineMiles(homewood.center, { lat: 38.99269, lon: -76.934345 })).toBeCloseTo(
      28.7,
      1,
    );
  });

  it("keeps listings inside the radius and drops the ones outside", () => {
    expect(inArea(homewood, 39.3355, -76.599)).toBe(true);
    expect(inArea(homewood, 38.99269, -76.934345)).toBe(false);
  });

  it("keeps a listing with no coordinates, because the pipeline geocodes it later", () => {
    expect(inArea(homewood, null, null)).toBe(true);
  });

  it("closes the bounding box polygon Redfin expects", () => {
    const polygon = bboxPolygon(homewood).split(",");
    expect(polygon).toHaveLength(5);
    expect(polygon[0]).toBe(polygon[4]);
    expect(polygon[0]).toBe("-76.6579 39.3009");
  });
});

describe("text helpers", () => {
  it("parses money out of the shapes sites use", () => {
    expect(parseMoney("$3,100")).toBe(3100);
    expect(parseMoney("$1,209 - $1,269")).toBe(1209);
    expect(parseMoney("1,430 sq. ft.")).toBe(1430);
    expect(parseMoney("Call for Rent")).toBeNull();
    expect(parseMoney(null)).toBeNull();
  });

  it("rejects square footage that cannot be a home", () => {
    expect(plausibleSqft(21.42)).toBeNull();
    expect(plausibleSqft(1820)).toBe(1820);
    expect(plausibleSqft(9223372036854776000)).toBeNull();
    expect(plausibleSqft(null)).toBeNull();
  });

  it("reads beds, baths and sqft from a summary line", () => {
    expect(parseBedBath("4BR / 3.5Ba 1820ft 2 available now")).toEqual({
      beds: 4,
      baths: 3.5,
      sqft: null,
    });
    expect(parseBedBath("4 beds · 3 baths · 3,000 sq ft")).toEqual({
      beds: 4,
      baths: 3,
      sqft: 3000,
    });
    expect(parseBedBath("3 bd / 1 ba")).toEqual({ beds: 3, baths: 1, sqft: null });
  });

  it("infers a property type from the labels a site supplies", () => {
    expect(propertyTypeFrom("Renovated End Unit Townhome")).toBe("rowhome");
    expect(propertyTypeFrom("Private Room For Rent")).toBe("room");
    expect(propertyTypeFrom("Studio-340 sqft")).toBe("studio");
    expect(propertyTypeFrom(null, undefined)).toBe("unknown");
  });

  it("marks only the amenities a label actually claims", () => {
    expect(amenitiesFromLabels(["cats are OK - purrr", "air conditioning", "furnished"])).toEqual({
      catsAllowed: true,
      airConditioning: true,
      furnished: true,
    });
    expect(amenitiesFromLabels([])).toEqual({});
  });

  it("normalizes phone numbers to ten digits", () => {
    expect(normalizePhone("(410) 440-8284")).toBe("4104408284");
    expect(normalizePhone("+14104408284")).toBe("4104408284");
    expect(normalizePhone("410-440-8284 ext. 12")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });

  it("normalizes dates to YYYY-MM-DD", () => {
    expect(isoDate("2026-08-02T23:59:59.000Z")).toBe("2026-08-02");
    expect(isoDate("not a date")).toBeNull();
    expect(isoDate(null)).toBeNull();
  });
});
