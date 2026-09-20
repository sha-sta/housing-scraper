import { describe, expect, it } from "vitest";
import { findDuplicate, SAME_UNIT_MILES, type DedupeCandidate } from "../src/pipeline/dedupe.ts";

function candidate(overrides: Partial<DedupeCandidate> = {}): DedupeCandidate {
  return {
    id: "a",
    addressKey: "3210 guilford ave",
    lat: 39.3285,
    lon: -76.6149,
    beds: 5,
    bedsMax: null,
    price: 3000,
    ...overrides,
  };
}

describe("findDuplicate", () => {
  it("matches on the normalized address", () => {
    const existing = [candidate({ id: "stored", lat: null, lon: null })];
    const found = findDuplicate(candidate({ id: "new", price: 2800 }), existing);
    expect(found?.id).toBe("stored");
  });

  it("treats a different unit number as a different unit", () => {
    const existing = [candidate({ id: "stored", addressKey: "3501 st paul st apt 4b", lat: null, lon: null })];
    const found = findDuplicate(
      candidate({ id: "new", addressKey: "3501 st paul st apt 5b", lat: null, lon: null }),
      existing,
    );
    expect(found).toBeNull();
  });

  it("matches two coordinates within forty metres that agree on beds and price", () => {
    const existing = [candidate({ id: "stored", addressKey: null })];
    // About 22 metres north.
    const near = candidate({ id: "new", addressKey: null, lat: 39.3287 });
    expect(findDuplicate(near, existing)?.id).toBe("stored");
  });

  it("rejects a near neighbour that disagrees on beds or price", () => {
    const existing = [candidate({ id: "stored", addressKey: null })];
    expect(findDuplicate(candidate({ id: "new", addressKey: null, lat: 39.3287, beds: 4 }), existing)).toBeNull();
    expect(findDuplicate(candidate({ id: "new", addressKey: null, lat: 39.3287, price: 2500 }), existing)).toBeNull();
  });

  it("rejects a listing further than forty metres away", () => {
    const existing = [candidate({ id: "stored", addressKey: null })];
    const far = candidate({ id: "new", addressKey: null, lat: 39.3295 });
    expect(findDuplicate(far, existing)).toBeNull();
  });

  it("never merges a building with a floor plan range into a single unit row", () => {
    const single = [candidate({ id: "stored", lat: null, lon: null })];
    const ranged = candidate({ id: "new", bedsMax: 4, lat: null, lon: null });
    expect(findDuplicate(ranged, single)).toBeNull();

    const bothRanged = [candidate({ id: "stored", bedsMax: 4, lat: null, lon: null })];
    expect(findDuplicate(ranged, bothRanged)?.id).toBe("stored");
  });

  it("never matches a listing against itself", () => {
    expect(findDuplicate(candidate({ id: "same" }), [candidate({ id: "same" })])).toBeNull();
  });

  it("needs both coordinates before it will use distance", () => {
    const existing = [candidate({ id: "stored", addressKey: null, lat: null, lon: null })];
    expect(findDuplicate(candidate({ id: "new", addressKey: null }), existing)).toBeNull();
  });

  it("uses forty metres as the threshold", () => {
    expect(SAME_UNIT_MILES).toBeCloseTo(0.02485, 4);
  });
});
