import { describe, expect, it } from "vitest";
import { PreferencesSchema, defaultPreferences, type Anchor } from "@housing/shared";
import {
  fromForm,
  hasLine,
  listToText,
  safeFromForm,
  textToList,
  toForm,
  toggleLine,
  type PreferencesForm,
} from "./prefs-form.ts";

const anchor: Anchor = { label: "JHU Homewood", lat: 39.3299, lon: -76.6205 };

function filled() {
  return PreferencesSchema.parse({
    group: { size: 6 },
    price: { maxTotal: 4800, maxPerPerson: 800, idealPerPerson: 650, allowUnknown: false },
    beds: { min: 5, max: 7, allowUnknown: true },
    baths: { min: 1.5 },
    sqft: { min: 1800 },
    propertyTypes: ["rowhome", "house"],
    location: {
      anchor,
      maxWalkMinutes: 12,
      idealWalkMinutes: 6,
      neighborhoodsInclude: ["Charles Village", "Remington"],
      neighborhoodsExclude: ["Waverly"],
      allowUnknown: true,
    },
    dates: {
      moveInEarliest: "2027-06-01",
      moveInLatest: "2027-08-15",
      leaseMonthsMin: 11,
      leaseMonthsMax: 13,
      allowUnknown: false,
    },
    amenities: { laundryInUnit: "must", dishwasher: "prefer", elevator: "avoid" },
    rules: {
      allowSublets: true,
      allowRoomsInSharedUnit: false,
      allowIncomeRestricted: false,
      allowSeniorHousing: false,
      hideSuspectedScams: true,
      requirePhotos: true,
      maxListingAgeDays: 21,
    },
    exclusions: {
      buildings: ["Nine East 33rd", "The Marylander"],
      addresses: ["9 E 33rd St"],
      landlords: ["Some LLC"],
      keywords: ["income restricted"],
      sources: ["facebook"],
    },
    keywords: { required: ["washer"], boost: ["porch", "yard"] },
    weights: { price: 4, distance: 5, amenities: 1, size: 0, freshness: 2 },
    notify: {
      enabled: true,
      topic: "housing-abc",
      shareTopic: "housing-share",
      minScore: 55,
      urgentScore: 90,
      priceDrops: false,
      backOnMarket: true,
      quietHours: { start: "23:30", end: "07:30" },
    },
    outreach: { autoDraft: false, templateId: "tpl_1", minScore: 70 },
  });
}

describe("round trip", () => {
  it("returns the defaults unchanged", () => {
    const prefs = defaultPreferences(anchor);
    expect(fromForm(toForm(prefs))).toEqual(prefs);
  });

  it("returns a fully filled profile unchanged", () => {
    const prefs = filled();
    expect(fromForm(toForm(prefs))).toEqual(prefs);
  });

  it("keeps every amenity importance", () => {
    const prefs = filled();
    const back = fromForm(toForm(prefs));
    expect(back.amenities.laundryInUnit).toBe("must");
    expect(back.amenities.dishwasher).toBe("prefer");
    expect(back.amenities.elevator).toBe("avoid");
    expect(back.amenities.gym).toBe("ignore");
  });

  it("keeps a half bath through the string round trip", () => {
    expect(fromForm(toForm(filled())).baths.min).toBe(1.5);
  });
});

describe("empty inputs become null, not zero", () => {
  it("clears optional numbers", () => {
    const form = toForm(filled());
    form.maxTotal = "";
    form.maxPerPerson = "";
    form.idealPerPerson = "";
    form.sqftMin = "";
    form.bedsMax = "";
    form.maxWalkMinutes = "";
    form.maxListingAgeDays = "";
    const prefs = fromForm(form);
    expect(prefs.price.maxTotal).toBeNull();
    expect(prefs.price.maxPerPerson).toBeNull();
    expect(prefs.price.idealPerPerson).toBeNull();
    expect(prefs.sqft.min).toBeNull();
    expect(prefs.beds.max).toBeNull();
    expect(prefs.location.maxWalkMinutes).toBeNull();
    expect(prefs.rules.maxListingAgeDays).toBeNull();
  });

  it("falls back to zero for the required minimums", () => {
    const form = toForm(filled());
    form.bedsMin = "";
    form.bathsMin = "";
    const prefs = fromForm(form);
    expect(prefs.beds.min).toBe(0);
    expect(prefs.baths.min).toBe(0);
  });

  it("never lets the group drop below one person", () => {
    const form = toForm(filled());
    form.groupSize = "";
    expect(fromForm(form).group.size).toBe(1);
    form.groupSize = "0";
    expect(fromForm(form).group.size).toBe(1);
    form.groupSize = "3.6";
    expect(fromForm(form).group.size).toBe(4);
  });

  it("clears the move-in window when the date inputs are empty", () => {
    const form = toForm(filled());
    form.moveInEarliest = "";
    form.moveInLatest = "";
    const prefs = fromForm(form);
    expect(prefs.dates.moveInEarliest).toBeNull();
    expect(prefs.dates.moveInLatest).toBeNull();
  });

  it("turns an empty template choice into null", () => {
    const form = toForm(filled());
    form.outreachTemplateId = "";
    expect(fromForm(form).outreach.templateId).toBeNull();
  });
});

describe("quiet hours", () => {
  it("drops to null when the switch is off and keeps the times for next time", () => {
    const form = toForm(filled());
    form.quietHoursEnabled = false;
    expect(fromForm(form).notify.quietHours).toBeNull();
    expect(form.quietStart).toBe("23:30");
  });

  it("offers sensible times when a profile has never set them", () => {
    const form = toForm(defaultPreferences(anchor));
    expect(form.quietHoursEnabled).toBe(false);
    expect(form.quietStart).toBe("23:00");
    expect(form.quietEnd).toBe("08:00");
    form.quietHoursEnabled = true;
    expect(fromForm(form).notify.quietHours).toEqual({ start: "23:00", end: "08:00" });
  });
});

describe("list fields", () => {
  it("uses one item per line and trims blanks", () => {
    expect(listToText(["a", "b"])).toBe("a\nb");
    expect(textToList("  a  \n\n b \n")).toEqual(["a", "b"]);
    expect(textToList("")).toEqual([]);
  });

  it("round trips exclusion lists", () => {
    const prefs = filled();
    expect(fromForm(toForm(prefs)).exclusions).toEqual(prefs.exclusions);
  });

  it("adds and removes a building without caring about case", () => {
    const start = "Nine East 33rd";
    expect(hasLine(start, "nine east 33rd")).toBe(true);
    expect(toggleLine(start, "The Marylander")).toBe("Nine East 33rd\nThe Marylander");
    expect(toggleLine(start, "nine east 33rd")).toBe("");
  });
});

describe("clamping and validation", () => {
  it("holds scores inside 0 to 100", () => {
    const form = toForm(filled());
    form.notifyMinScore = 140;
    form.notifyUrgentScore = -20;
    form.outreachMinScore = 999;
    const prefs = fromForm(form);
    expect(prefs.notify.minScore).toBe(100);
    expect(prefs.notify.urgentScore).toBe(0);
    expect(prefs.outreach.minScore).toBe(100);
  });

  it("keeps weights at or above zero", () => {
    const form = toForm(filled());
    form.weightPrice = -3;
    expect(fromForm(form).weights.price).toBe(0);
  });

  it("reports rather than throws on bad input", () => {
    // reason: PropertyType is a closed union, so the only way to prove the parse rejects a
    // bad value is to hand it one the editor's own types forbid.
    const notAType: string[] = ["mansion"];
    const broken = { ...toForm(filled()), propertyTypes: notAType } as PreferencesForm;
    const result = safeFromForm(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("propertyTypes");
  });

  it("succeeds on anything the editor can actually produce", () => {
    const result = safeFromForm(toForm(filled()));
    expect(result.ok).toBe(true);
  });
});
