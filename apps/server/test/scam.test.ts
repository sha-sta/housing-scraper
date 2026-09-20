import { describe, expect, it } from "vitest";
import { computeScamSignals, descriptionKey, type ScamContext, type ScamInput } from "../src/pipeline/scam.ts";

function input(overrides: Partial<ScamInput> = {}): ScamInput {
  return { price: 3000, address: "3210 Guilford Ave", photos: ["a.jpg"], text: "Nice row home.", ...overrides };
}

function context(overrides: Partial<ScamContext> = {}): ScamContext {
  return { comparablePrices: [], textSeenAtAnotherAddress: false, ...overrides };
}

describe("computeScamSignals", () => {
  it("returns nothing for an ordinary listing", () => {
    expect(computeScamSignals(input(), context())).toEqual([]);
  });

  it("flags a price far below the comparable median", () => {
    const comparables = { comparablePrices: [3000, 3100, 3200, 2900, 3050] };
    expect(computeScamSignals(input({ price: 800 }), context(comparables))).toContain("priceFarBelowArea");
    expect(computeScamSignals(input({ price: 2800 }), context(comparables))).not.toContain("priceFarBelowArea");
  });

  it("stays quiet when there are too few comparables to trust", () => {
    expect(computeScamSignals(input({ price: 200 }), context({ comparablePrices: [3000, 3100] }))).toEqual([]);
  });

  it("flags wire transfer and gift card wording", () => {
    expect(computeScamSignals(input({ text: "Send a wire transfer to hold it" }), context())).toContain(
      "wireOrGiftCardLanguage",
    );
    expect(computeScamSignals(input({ text: "Pay with gift cards only" }), context())).toContain(
      "wireOrGiftCardLanguage",
    );
  });

  it("flags an absent landlord", () => {
    expect(computeScamSignals(input({ text: "I am currently out of the country" }), context())).toContain(
      "landlordOutOfCountry",
    );
    expect(computeScamSignals(input({ text: "I am on a mission trip abroad" }), context())).toContain(
      "landlordOutOfCountry",
    );
  });

  it("flags a deposit demanded before a viewing", () => {
    expect(
      computeScamSignals(input({ text: "Send the deposit before you view the unit" }), context()),
    ).toContain("depositBeforeViewing");
    expect(computeScamSignals(input({ text: "I will ship the keys once paid" }), context())).toContain(
      "depositBeforeViewing",
    );
  });

  it("flags text reused at another address", () => {
    expect(computeScamSignals(input(), context({ textSeenAtAnotherAddress: true }))).toContain(
      "duplicateTextDifferentAddress",
    );
  });

  it("flags a listing with no address and no photos", () => {
    expect(computeScamSignals(input({ address: null, photos: [] }), context())).toContain("noAddressNoPhotos");
    expect(computeScamSignals(input({ address: null }), context())).not.toContain("noAddressNoPhotos");
  });

  it("can raise several signals at once", () => {
    const signals = computeScamSignals(
      input({
        address: null,
        photos: [],
        price: 400,
        text: "I am out of the country, wire transfer the deposit before you see it.",
      }),
      context({ comparablePrices: [3000, 3100, 3200, 2900, 3050] }),
    );
    expect(signals).toEqual(
      expect.arrayContaining([
        "priceFarBelowArea",
        "wireOrGiftCardLanguage",
        "landlordOutOfCountry",
        "depositBeforeViewing",
        "noAddressNoPhotos",
      ]),
    );
  });
});

describe("descriptionKey", () => {
  it("ignores punctuation and spacing", () => {
    const long = "This is a long enough description of a lovely row home near the Homewood campus in Baltimore.";
    expect(descriptionKey(long)).toBe(descriptionKey(long.toUpperCase().replace(/ /g, "   ")));
  });

  it("ignores short or missing text, which repeats innocently", () => {
    expect(descriptionKey("Nice place")).toBeNull();
    expect(descriptionKey(null)).toBeNull();
  });
});
