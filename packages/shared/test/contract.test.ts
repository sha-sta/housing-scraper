import { describe, expect, it } from "vitest";
import {
  CAMPUSES,
  CampusPresetSchema,
  ListingQuerySchema,
  RawListingSchema,
  composeUrl,
  defaultPreferences,
  getCampus,
} from "../src/index.ts";

const message = {
  to: "landlord@example.com",
  subject: "6 bed on St Paul St & a tour?",
  body: "Hi,\nWe are a group of 6.\nThanks",
};

describe("composeUrl", () => {
  it("builds a mailto link with every field percent-encoded", () => {
    expect(composeUrl("mailto", message)).toBe(
      "mailto:landlord%40example.com?subject=6%20bed%20on%20St%20Paul%20St%20%26%20a%20tour%3F&body=Hi%2C%0AWe%20are%20a%20group%20of%206.%0AThanks",
    );
  });

  it("never encodes a space as a plus sign, which Outlook shows literally", () => {
    const url = composeUrl("outlook", message);
    expect(url.startsWith("https://outlook.office.com/mail/deeplink/compose?to=")).toBe(true);
    expect(url).not.toContain("+");
  });

  it("uses su for the Gmail subject", () => {
    expect(composeUrl("gmail", message)).toContain("&su=6%20bed");
  });
});

describe("defaultPreferences", () => {
  it("fills every nested default from the anchor alone", () => {
    const homewood = getCampus("homewood");
    if (!homewood) throw new Error("homewood preset missing");
    const prefs = defaultPreferences(homewood.anchor);
    expect(prefs.location.anchor.label).toBe("JHU Homewood");
    expect(prefs.amenities.parking).toBe("ignore");
    expect(prefs.rules.hideSuspectedScams).toBe(true);
    expect(prefs.notify.minScore).toBe(50);
  });
});

describe("ListingQuerySchema", () => {
  it("reads the query string false as false", () => {
    const query = ListingQuerySchema.parse({ includeGone: "false", includeHidden: "true" });
    expect(query.includeGone).toBe(false);
    expect(query.includeHidden).toBe(true);
    expect(query.starred).toBeUndefined();
  });
});

describe("RawListingSchema", () => {
  it("leaves unstated facts null so the pipeline knows to infer them", () => {
    const raw = RawListingSchema.parse({ sourceId: "x", sourceListingId: "1", url: "https://example.com/1", title: "t" });
    expect(raw.priceBasis).toBeNull();
    expect(raw.incomeRestricted).toBeNull();
    expect(raw.bedsMax).toBeNull();
  });
});

describe("CAMPUSES", () => {
  it("every preset parses and has a unique id", () => {
    for (const campus of CAMPUSES) CampusPresetSchema.parse(campus);
    expect(new Set(CAMPUSES.map((c) => c.id)).size).toBe(CAMPUSES.length);
  });
});
