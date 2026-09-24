import { describe, expect, it } from "vitest";
import {
  composeLabel,
  formatAvailable,
  formatBaths,
  formatBedRange,
  formatBeds,
  excerpt,
  formatDate,
  formatInterval,
  formatLease,
  formatMoney,
  formatPerPerson,
  formatPriceRange,
  formatSqft,
  formatPerRoom,
  formatWalk,
  headlinePrice,
  isRangedBuilding,
  perRoomNote,
  priceBasisLabel,
  mailtoHref,
  pluralize,
  propertyLabel,
  relativeTime,
  scoreBand,
  scoreWord,
  shortAddress,
  smsHref,
  sourceLabel,
  suggestComposeVia,
  telHref,
} from "./format.ts";

describe("money", () => {
  it("rounds to whole dollars", () => {
    expect(formatMoney(2799.4)).toBe("$2,799");
    expect(formatMoney(2800)).toBe("$2,800");
  });

  it("says so when a listing has no price", () => {
    expect(formatMoney(null)).toBe("Price on request");
    expect(formatMoney(undefined)).toBe("Price on request");
    expect(formatMoney(Number.NaN)).toBe("Price on request");
  });

  it("shows a range only when the top is higher", () => {
    expect(formatPriceRange(2400, 3200)).toBe("$2,400 to $3,200");
    expect(formatPriceRange(2400, 2400)).toBe("$2,400");
    expect(formatPriceRange(2400, null)).toBe("$2,400");
    expect(formatPriceRange(null, 3200)).toBe("Price on request");
  });

  it("labels the per-person split", () => {
    expect(formatPerPerson(700)).toBe("$700 each");
    expect(formatPerPerson(null)).toBe("Split unknown");
  });
});

describe("per-room pricing", () => {
  it("leaves a whole-unit listing alone", () => {
    expect(headlinePrice(3900, null, "unit", 3900)).toEqual({
      headline: "$3,900",
      perRoom: null,
    });
    expect(headlinePrice(1500, 4200, "unit", null)).toEqual({
      headline: "$1,500 to $4,200",
      perRoom: null,
    });
  });

  it("leads with the whole-unit total the engine used, not the room rate", () => {
    expect(headlinePrice(850, null, "room", 4250)).toEqual({
      headline: "$4,250",
      perRoom: "$850 per room",
    });
  });

  it("falls back to the room rate, labelled, when no total is available", () => {
    expect(headlinePrice(850, null, "room", null)).toEqual({
      headline: "$850 per room",
      perRoom: null,
    });
  });

  it("drops the aside when the room rate itself is missing", () => {
    expect(headlinePrice(null, null, "room", 4250)).toEqual({
      headline: "$4,250",
      perRoom: null,
    });
  });

  it("labels the basis in plain words", () => {
    expect(priceBasisLabel("room")).toBe("Per room");
    expect(priceBasisLabel("unit")).toBe("Whole unit");
    expect(formatPerRoom(850)).toBe("$850 per room");
    expect(formatPerRoom(null)).toBe("Price on request");
  });

  it("explains the arithmetic in one sentence", () => {
    expect(perRoomNote(850, 5)).toBe(
      "This landlord quotes a price for each bedroom. The total above is $850 across 5 bedrooms.",
    );
    expect(perRoomNote(null, null)).toBe(
      "This landlord quotes a price for each bedroom. The total above is the per-room price across every bedroom.",
    );
  });
});

describe("unit facts", () => {
  it("names a studio rather than printing zero bedrooms", () => {
    expect(formatBeds(0)).toBe("Studio");
    expect(formatBeds(4)).toBe("4 bd");
    expect(formatBeds(null)).toBe("Beds unknown");
  });

  it("keeps half baths", () => {
    expect(formatBaths(1.5)).toBe("1.5 ba");
    expect(formatBaths(2)).toBe("2 ba");
    expect(formatBaths(null)).toBe("Baths unknown");
  });

  it("says the bedroom range when one row stands for a building", () => {
    expect(formatBedRange(1, 4)).toBe("1 to 4 bd");
    expect(formatBedRange(0, 4)).toBe("Studio to 4 bd");
    expect(formatBedRange(4, 4)).toBe("4 bd");
    expect(formatBedRange(4, null)).toBe("4 bd");
    expect(formatBedRange(null, 4)).toBe("4 bd");
    expect(formatBedRange(null, null)).toBe("Beds unknown");
  });

  it("spots a building with several floor plans from either range", () => {
    expect(isRangedBuilding(1, 4, 1500, 4200)).toBe(true);
    expect(isRangedBuilding(1, 4, 1500, null)).toBe(true);
    expect(isRangedBuilding(3, null, 1500, 4200)).toBe(true);
    expect(isRangedBuilding(3, 3, 1500, 1500)).toBe(false);
    expect(isRangedBuilding(3, null, 1500, null)).toBe(false);
  });

  it("groups square feet", () => {
    expect(formatSqft(1400)).toBe("1,400 sq ft");
    expect(formatSqft(null)).toBe("Size unknown");
  });

  it("rounds walk minutes", () => {
    expect(formatWalk(12.4)).toBe("12 min walk");
    expect(formatWalk(null)).toBe("Walk time unknown");
  });

  it("gives every property type a plain name", () => {
    expect(propertyLabel("rowhome")).toBe("Row home");
    expect(propertyLabel("room")).toBe("Room in a shared unit");
    expect(propertyLabel("unknown")).toBe("Type not listed");
  });
});

describe("dates", () => {
  const now = new Date("2026-09-20T12:00:00Z");

  it("counts up in the unit a person would use", () => {
    expect(relativeTime("2026-09-20T11:56:00Z", now)).toBe("4m ago");
    expect(relativeTime("2026-09-20T11:59:40Z", now)).toBe("just now");
    expect(relativeTime("2026-09-20T09:00:00Z", now)).toBe("3h ago");
    expect(relativeTime("2026-09-18T12:00:00Z", now)).toBe("2d ago");
  });

  it("falls back to a date past a week", () => {
    expect(relativeTime("2026-09-01T12:00:00Z", now)).toBe("Sep 1");
  });

  it("reads a bare ISO date as UTC so it does not slip a day", () => {
    expect(formatDate("2026-08-01")).toBe("Aug 1");
    expect(formatDate(null)).toBe("unknown");
    expect(formatDate("not a date")).toBe("unknown");
  });

  it("says when a move-in date is missing", () => {
    expect(formatAvailable("2026-08-01")).toBe("Available Aug 1");
    expect(formatAvailable(null)).toBe("Move-in date not listed");
  });

  it("describes lease length", () => {
    expect(formatLease(12)).toBe("12 month lease");
    expect(formatLease(null)).toBe("Lease length not listed");
  });

  it("turns run intervals into readable spans", () => {
    expect(formatInterval(45)).toBe("45 sec");
    expect(formatInterval(600)).toBe("10 min");
    expect(formatInterval(5400)).toBe("1.5 hr");
  });
});

describe("score bands", () => {
  it("splits at 40, 60 and 80", () => {
    expect(scoreBand(0)).toBe(0);
    expect(scoreBand(39)).toBe(0);
    expect(scoreBand(40)).toBe(1);
    expect(scoreBand(59)).toBe(1);
    expect(scoreBand(60)).toBe(2);
    expect(scoreBand(79)).toBe(2);
    expect(scoreBand(80)).toBe(3);
    expect(scoreBand(100)).toBe(3);
  });

  it("gives each band a word", () => {
    expect(scoreWord(92)).toBe("Strong fit");
    expect(scoreWord(65)).toBe("Good fit");
    expect(scoreWord(45)).toBe("Loose fit");
    expect(scoreWord(12)).toBe("Weak fit");
  });
});

describe("links", () => {
  it("strips punctuation out of phone numbers", () => {
    expect(telHref("(410) 555-0134")).toBe("tel:4105550134");
    expect(telHref("+1 410-555-0134")).toBe("tel:+14105550134");
  });

  it("prefills an sms body", () => {
    expect(smsHref("410-555-0134", "Is it still open?")).toBe(
      "sms:4105550134?&body=Is%20it%20still%20open%3F",
    );
  });

  it("prefills a mailto", () => {
    expect(mailtoHref("a@b.com", "Hi there", "Line one")).toBe(
      "mailto:a@b.com?subject=Hi%20there&body=Line%20one",
    );
  });
});

describe("source names", () => {
  it("uses the known name, otherwise capitalises the id", () => {
    expect(sourceLabel("craigslist")).toBe("Craigslist");
    expect(sourceLabel("jhu-och")).toBe("JHU Off-Campus Housing");
    expect(sourceLabel("rentcom")).toBe("Rent.com");
    expect(sourceLabel("someplace")).toBe("Someplace");
  });
});

describe("compose", () => {
  it("labels each mailbox in plain words", () => {
    expect(composeLabel("outlook")).toBe("Open in Outlook");
    expect(composeLabel("gmail")).toBe("Open in Gmail");
    expect(composeLabel("mailto")).toBe("Open in mail app");
  });

  it("suggests Outlook for a school address and the mail app otherwise", () => {
    expect(suggestComposeVia("srivera@example.edu")).toBe("outlook");
    expect(suggestComposeVia("  CYOON@JHU.EDU  ")).toBe("outlook");
    expect(suggestComposeVia("me@gmail.com")).toBe("mailto");
    expect(suggestComposeVia("")).toBe("mailto");
  });
});

describe("short address", () => {
  it("drops a trailing city, state and zip", () => {
    expect(shortAddress("412 E 31st St, Baltimore, MD 21218")).toBe("412 E 31st St");
    expect(shortAddress("3300 N Charles St, Baltimore, MD 21218-1234")).toBe("3300 N Charles St");
    expect(shortAddress("1 Main St, Mount Washington, MD 21209")).toBe("1 Main St");
  });

  it("leaves anything else alone", () => {
    expect(shortAddress("412 E 31st St")).toBe("412 E 31st St");
    expect(shortAddress("412 E 31st St, Apt 3")).toBe("412 E 31st St, Apt 3");
    expect(shortAddress("412 E 31st St, Baltimore")).toBe("412 E 31st St, Baltimore");
    expect(shortAddress("Baltimore, MD 21218")).toBe("Baltimore, MD 21218");
  });

  it("keeps a unit that sits before the city", () => {
    expect(shortAddress("3501 St Paul St Apt 4B, Baltimore, MD 21218")).toBe(
      "3501 St Paul St Apt 4B",
    );
  });
});

describe("excerpt", () => {
  it("collapses whitespace", () => {
    expect(excerpt("Six   bedrooms\n\nover  three floors.", 200)).toBe(
      "Six bedrooms over three floors.",
    );
  });

  it("returns short text untouched", () => {
    expect(excerpt("Front porch.", 200)).toBe("Front porch.");
  });

  it("cuts at a word boundary", () => {
    const long = "word ".repeat(80);
    const out = excerpt(long, 200);
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out.endsWith("word")).toBe(true);
  });
});

describe("pluralize", () => {
  it("drops the plural for one", () => {
    expect(pluralize(1, "listing", "listings")).toBe("1 listing");
    expect(pluralize(0, "listing", "listings")).toBe("0 listings");
    expect(pluralize(12, "listing", "listings")).toBe("12 listings");
  });
});
