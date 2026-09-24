import { describe, expect, it } from "vitest";
import { FILTER_REASONS, type FilterReason } from "@housing/shared";
import { reasonSection, rejectList, rejectListShort, rejectReason } from "./reasons.ts";

const EM_DASH = String.fromCharCode(0x2014);

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
