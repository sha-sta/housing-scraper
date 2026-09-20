import { describe, expect, it } from "vitest";
import { FILTER_REASONS, type FilterReason } from "@housing/shared";
import { reasonSection, rejectReason, rejectSummary } from "./reasons.ts";

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

describe("reject summary", () => {
  it("prints one reason as itself", () => {
    expect(rejectSummary(["priceOverMax"])).toBe("Costs more than your budget");
  });

  it("counts the rest instead of listing them", () => {
    expect(rejectSummary(["priceOverMax", "tooFar"])).toBe(
      "Costs more than your budget, and 1 more reason",
    );
    expect(rejectSummary(["priceOverMax", "tooFar", "noPhotos"])).toBe(
      "Costs more than your budget, and 2 more reasons",
    );
  });

  it("has something to say when the list is empty", () => {
    const none: FilterReason[] = [];
    expect(rejectSummary(none)).toBe("Rejected");
  });
});
