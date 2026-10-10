import { describe, expect, it } from "vitest";
import {
  FILTER_REASONS,
  defaultPreferences,
  type FilterReason,
  type Preferences,
} from "@housing/shared";
import {
  loosenHint,
  loosenSuggestion,
  reasonSection,
  rejectList,
  rejectListShort,
  rejectReason,
} from "./reasons.ts";

const EM_DASH = String.fromCharCode(0x2014);

const anchor = { label: "JHU Homewood", lat: 39.3299, lon: -76.6205 };

function prefs(overrides: (base: Preferences) => Preferences = (base) => base): Preferences {
  return overrides(defaultPreferences(anchor));
}

describe("reject reasons", () => {
  it("covers every reason the contract can return", () => {
    for (const reason of FILTER_REASONS) {
      expect(rejectReason(reason), reason).toBeTruthy();
      expect(reasonSection(reason), reason).toBeTruthy();
    }
  });

  it("writes plain sentences with no jargon or punctuation tics", () => {
    for (const reason of FILTER_REASONS) {
      const text = rejectReason(reason);
      expect(text[0], reason).toBe(text[0]?.toUpperCase());
      expect(text, reason).not.toMatch(/[_{}]|\bnull\b|\bundefined\b/);
      expect(text, reason).not.toContain(EM_DASH);
      expect(text.length, reason).toBeLessThan(70);
    }
  });

  it("names the setting a reader would change", () => {
    expect(rejectReason("priceOverMax")).toBe("Costs more than your budget");
    expect(rejectReason("tooFar")).toBe("Longer walk than your maximum");
    expect(rejectReason("missingRequiredAmenity")).toBe(
      "Missing an amenity you marked as a must",
    );
    expect(rejectReason("excludedBuilding")).toBe("A building on your exclude list");
  });

  it("points at the editor section that owns the rule", () => {
    expect(reasonSection("priceOverMax")).toBe("budget");
    expect(reasonSection("tooFar")).toBe("location");
    expect(reasonSection("suspectedScam")).toBe("rules");
    expect(reasonSection("missingRequiredKeyword")).toBe("keywords");
  });
});

describe("reject lists", () => {
  it("names every reason on a wide screen", () => {
    expect(rejectList(["priceOverMax"])).toBe("Costs more than your budget");
    expect(rejectList(["priceOverMax", "tooFar", "noPhotos"])).toBe(
      "Costs more than your budget, Longer walk than your maximum, No photos, and you require them",
    );
  });

  it("keeps three and counts the rest on a phone", () => {
    const four: FilterReason[] = ["priceOverMax", "tooFar", "noPhotos", "suspectedScam"];
    expect(rejectListShort(four)).toBe(
      "Costs more than your budget, Longer walk than your maximum, No photos, and you require them, +1 more",
    );
    expect(rejectListShort(["priceOverMax", "tooFar"])).toBe(
      "Costs more than your budget, Longer walk than your maximum",
    );
  });

  it("has something to say when the list is empty", () => {
    const none: FilterReason[] = [];
    expect(rejectList(none)).toBe("Rejected");
    expect(rejectListShort(none)).toBe("Rejected");
  });
});

describe("loosening suggestions", () => {
  it("offers one for every reason the contract can return", () => {
    const base = prefs();
    for (const reason of FILTER_REASONS) {
      const text = loosenSuggestion(reason, base);
      expect(text, reason).toMatch(/^Try /);
      expect(text, reason).toMatch(/\.$/);
      expect(text, reason).not.toContain(EM_DASH);
      expect(text.length, reason).toBeLessThan(70);
    }
  });

  it("moves the number the reason names", () => {
    expect(
      loosenSuggestion(
        "tooFar",
        prefs((base) => ({
          ...base,
          location: { ...base.location, maxWalkMinutes: 10 },
        })),
      ),
    ).toBe("Try 15 minutes.");
    expect(
      loosenSuggestion(
        "priceOverMax",
        prefs((base) => ({ ...base, price: { ...base.price, maxPerPerson: 800 } })),
      ),
    ).toBe("Try $900 each.");
    expect(
      loosenSuggestion(
        "bedsOutOfRange",
        prefs((base) => ({ ...base, beds: { ...base.beds, min: 5 } })),
      ),
    ).toBe("Try 4 bedrooms as the minimum.");
    expect(
      loosenSuggestion(
        "bathsUnderMin",
        prefs((base) => ({ ...base, baths: { min: 1.5 } })),
      ),
    ).toBe("Try 1 bathroom as the minimum.");
  });

  it("falls back to plain advice when there is no number to move", () => {
    const open = prefs((base) => ({
      ...base,
      price: { ...base.price, maxPerPerson: null, maxTotal: null },
      location: { ...base.location, maxWalkMinutes: null },
    }));
    expect(loosenSuggestion("priceOverMax", open)).toBe("Try raising your budget.");
    expect(loosenSuggestion("tooFar", open)).toBe("Try raising your walk limit.");
  });
});

describe("the hint for a feed that matched nothing", () => {
  const base = prefs((p) => ({ ...p, location: { ...p.location, maxWalkMinutes: 10 } }));

  it("names the top reason, its count and one move", () => {
    expect(loosenHint([["tooFar", 38], ["noPhotos", 4]], base)).toBe(
      "Longer walk than your maximum stopped 38 listings. Try 15 minutes.",
    );
  });

  it("counts one listing as one", () => {
    expect(loosenHint([["tooFar", 1]], base)).toBe(
      "Longer walk than your maximum stopped 1 listing. Try 15 minutes.",
    );
  });

  it("says nothing without a reason to name", () => {
    expect(loosenHint([], base)).toBe(null);
    expect(loosenHint([["tooFar", 0]], base)).toBe(null);
  });
});
