import { RawListingSchema } from "@housing/shared";
import { describe, expect, it } from "vitest";
import { normalize } from "../src/pipeline/normalize.ts";
import {
  addressKey,
  cleanAddress,
  detectIncomeRestricted,
  detectSeniorHousing,
  extractAmenities,
  extractAvailableDate,
  extractEmail,
  extractLeaseMonths,
  extractPhone,
  inferPriceBasis,
  inferPropertyType,
  isNonHousing,
} from "../src/pipeline/text.ts";

const NOW = new Date("2026-09-20T12:00:00.000Z");

describe("amenity extraction", () => {
  it("reads laundry, dishwasher, and air conditioning out of prose", () => {
    const found = extractAmenities("Washer/dryer in unit, dishwasher, central air.");
    expect(found.laundryInUnit).toBe(true);
    expect(found.dishwasher).toBe(true);
    expect(found.airConditioning).toBe(true);
  });

  it("separates in-unit laundry from building laundry", () => {
    const building = extractAmenities("Coin operated laundry room in the basement.");
    expect(building.laundryInBuilding).toBe(true);
    expect(building.laundryInUnit).toBe(false);
  });

  it("records a denial as false rather than leaving it silent", () => {
    const found = extractAmenities("No pets. No parking available. Unfurnished.");
    expect(found.catsAllowed).toBe(false);
    expect(found.dogsAllowed).toBe(false);
    expect(found.parking).toBe(false);
    expect(found.furnished).toBe(false);
  });

  it("stays silent about anything the text does not mention", () => {
    expect(extractAmenities("Bright and sunny.").elevator).toBeUndefined();
  });

  it("reads pet, outdoor, utility, and accessibility wording", () => {
    const found = extractAmenities(
      "Cat friendly, private back yard, all utilities included, ADA accessible, fitness center on site.",
    );
    expect(found.catsAllowed).toBe(true);
    expect(found.outdoorSpace).toBe(true);
    expect(found.utilitiesIncluded).toBe(true);
    expect(found.wheelchairAccessible).toBe(true);
    expect(found.gym).toBe(true);
  });
});

describe("property type inference", () => {
  it("maps every row home spelling", () => {
    expect(inferPropertyType("Charming row home near campus")).toBe("rowhome");
    expect(inferPropertyType("Renovated row house")).toBe("rowhome");
    expect(inferPropertyType("Spacious townhouse")).toBe("rowhome");
    expect(inferPropertyType("Three story townhome")).toBe("rowhome");
  });

  it("maps whole house and room wording", () => {
    expect(inferPropertyType("Rent the entire house")).toBe("house");
    expect(inferPropertyType("Single-family home for rent")).toBe("house");
    expect(inferPropertyType("Private room for rent, roommate wanted")).toBe("room");
  });

  it("falls through to apartment and returns null with nothing to go on", () => {
    expect(inferPropertyType("Second floor apartment")).toBe("apartment");
    expect(inferPropertyType("Great place")).toBeNull();
  });
});

describe("available date extraction", () => {
  it("reads a month name with no year and picks the next occurrence", () => {
    expect(extractAvailableDate("Available June 1", NOW)).toBe("2027-06-01");
    expect(extractAvailableDate("Available October 15", NOW)).toBe("2026-10-15");
  });

  it("reads an abbreviated numeric date with a year", () => {
    expect(extractAvailableDate("Avail 8/1/2027", NOW)).toBe("2027-08-01");
    expect(extractAvailableDate("Available 6/1", NOW)).toBe("2027-06-01");
    expect(extractAvailableDate("Available 12/1/27", NOW)).toBe("2027-12-01");
  });

  it("reads an ISO date and an immediate opening", () => {
    expect(extractAvailableDate("Available 2027-01-15 after renovations", NOW)).toBe("2027-01-15");
    expect(extractAvailableDate("Available now", NOW)).toBe("2026-09-20");
    expect(extractAvailableDate("Available immediately", NOW)).toBe("2026-09-20");
  });

  it("returns null when the text says nothing about a date", () => {
    expect(extractAvailableDate("Great row home with parking", NOW)).toBeNull();
  });
});

describe("lease length extraction", () => {
  it("reads months, years, and month to month", () => {
    expect(extractLeaseMonths("12 month lease required")).toBe(12);
    expect(extractLeaseMonths("9-month lease for the school year")).toBe(9);
    expect(extractLeaseMonths("Two year lease preferred")).toBe(24);
    expect(extractLeaseMonths("Month-to-month available")).toBe(1);
    expect(extractLeaseMonths("Annual lease")).toBe(12);
  });

  it("returns null with nothing to read", () => {
    expect(extractLeaseMonths("Sunny and quiet")).toBeNull();
  });
});

describe("contact extraction", () => {
  it("pulls an email out of a description", () => {
    expect(extractEmail("Write to Leasing+Info@Example.COM for a tour")).toBe("leasing+info@example.com");
    expect(extractEmail("No contact details here")).toBeNull();
  });

  it("pulls a phone number in several shapes", () => {
    expect(extractPhone("Call (410) 555-1234")).toBe("(410) 555-1234");
    expect(extractPhone("text 410-555-1234 anytime")).toBe("(410) 555-1234");
    expect(extractPhone("410.555.1234")).toBe("(410) 555-1234");
    expect(extractPhone("+1 410 555 1234")).toBe("(410) 555-1234");
    expect(extractPhone("4105551234")).toBe("(410) 555-1234");
  });

  it("does not read a price or a square footage as a phone number", () => {
    expect(extractPhone("$2,400 a month, 1800 sqft")).toBeNull();
  });
});

describe("price basis inference", () => {
  it("reads the per room wording students actually see", () => {
    expect(inferPriceBasis("5 bedrooms available in a spectacular renovated rowhome", 5, 850)).toBe("room");
    expect(inferPriceBasis("Large room, $700 per room", 4, 700)).toBe("room");
    expect(inferPriceBasis("Rent is per bedroom", 3, 900)).toBe("room");
    expect(inferPriceBasis("$650 /bedroom", 4, 650)).toBe("room");
    expect(inferPriceBasis("Rooms available now", 5, 900)).toBe("room");
    expect(inferPriceBasis("$800 per person", 6, 800)).toBe("room");
  });

  it("uses the per bedroom ceiling when the wording says nothing", () => {
    expect(inferPriceBasis("Charles Village Townhouse", 5, 495)).toBe("room");
    // Exactly at the ceiling is a whole unit, only strictly under counts as a room.
    expect(inferPriceBasis("Townhouse", 2, 900)).toBe("unit");
    expect(inferPriceBasis("Townhouse", 2, 898)).toBe("room");
    expect(inferPriceBasis("Studio", 1, 300)).toBe("unit");
    expect(inferPriceBasis("Row home", 5, 3000)).toBe("unit");
    expect(inferPriceBasis("Row home", null, 3000)).toBe("unit");
  });
});

describe("non-housing detection", () => {
  it("drops the AppFolio parking and storage rows", () => {
    expect(isNonHousing("Parking Spot 14", null)).toBe(true);
    expect(isNonHousing("Secure parking", null)).toBe(true);
    expect(isNonHousing("Garage - 2900 block", null)).toBe(true);
    expect(isNonHousing("Storage unit B", null)).toBe(true);
    expect(isNonHousing("Parking space, monthly", null)).toBe(true);
  });

  it("keeps anything that is a place to live", () => {
    expect(isNonHousing("3BR rowhome with garage parking", 3)).toBe(false);
    expect(isNonHousing("3BR rowhome with garage parking", null)).toBe(false);
    expect(isNonHousing("Apartment with parking space", null)).toBe(false);
    expect(isNonHousing("Townhouse, garage included", null)).toBe(false);
    expect(isNonHousing("Parking Spot 14", 0)).toBe(false);
  });
});

describe("restriction detection", () => {
  it("spots income restricted wording", () => {
    expect(detectIncomeRestricted("This is an income-restricted property")).toBe(true);
    expect(detectIncomeRestricted("Must meet income requirements, 60% AMI")).toBe(true);
    expect(detectIncomeRestricted("Bright row home near campus")).toBe(false);
  });

  it("spots senior housing wording", () => {
    expect(detectSeniorHousing("Senior living community")).toBe(true);
    expect(detectSeniorHousing("55+ active adult community")).toBe(true);
    expect(detectSeniorHousing("Great for students")).toBe(false);
  });
});

describe("address handling", () => {
  it("standardizes the display form", () => {
    expect(cleanAddress("  3210  guilford   avenue , baltimore , md 21218 ")).toBe(
      "3210 Guilford Ave, Baltimore, MD 21218",
    );
    expect(cleanAddress("125 west 27th street")).toBe("125 W 27th St");
    expect(cleanAddress(null)).toBeNull();
  });

  it("builds the same dedupe key from two spellings of one address", () => {
    expect(addressKey("3210 Guilford Avenue, Baltimore, MD 21218")).toBe(addressKey("3210 guilford ave"));
    expect(addressKey("125 West 27th Street")).toBe(addressKey("125 W 27th St, Baltimore MD"));
  });

  it("keeps the unit number in the key", () => {
    expect(addressKey("3501 St Paul St Apt 4B")).toBe("3501 st paul st apt 4b");
    expect(addressKey("3501 St Paul St #4B, Baltimore")).toBe("3501 st paul st apt 4b");
    expect(addressKey("3501 St Paul St Apt 4B")).not.toBe(addressKey("3501 St Paul St Apt 5B"));
  });

  it("returns null for an address with no street", () => {
    expect(addressKey(null)).toBeNull();
    expect(addressKey(", , ")).toBeNull();
  });
});

describe("normalize", () => {
  it("fills the gaps a source leaves and keeps what the source asserted", () => {
    const raw = RawListingSchema.parse({
      sourceId: "demo",
      sourceListingId: "unit-1",
      url: "https://example.com/unit-1",
      title: "5 BR row house near campus",
      description:
        "Washer/dryer in unit and a dishwasher. Available June 1 for a 12 month lease. " +
        "Email leasing@example.com or call (410) 555-9876.",
      price: 3000,
      beds: 5,
      address: "3210 guilford avenue, baltimore, md 21218",
      amenities: { parking: false },
    });

    const normalized = normalize(raw, NOW);
    expect(normalized.propertyType).toBe("rowhome");
    expect(normalized.availableDate).toBe("2027-06-01");
    expect(normalized.leaseMonths).toBe(12);
    expect(normalized.contact.email).toBe("leasing@example.com");
    expect(normalized.contact.phone).toBe("(410) 555-9876");
    expect(normalized.amenities.laundryInUnit).toBe(true);
    // The source said there is no parking, so the description never overrides it.
    expect(normalized.amenities.parking).toBe(false);
    expect(normalized.address).toBe("3210 Guilford Ave, Baltimore, MD 21218");
    expect(normalized.addressKey).toBe("3210 guilford ave");
  });

  it("never overrides a property type the source already stated", () => {
    const raw = RawListingSchema.parse({
      sourceId: "demo",
      sourceListingId: "unit-2",
      url: "https://example.com/unit-2",
      title: "Condo that used to be a row house",
      propertyType: "condo",
    });
    expect(normalize(raw, NOW).propertyType).toBe("condo");
  });

  it("keeps a stated restriction flag and only guesses when the source is silent", () => {
    const silent = RawListingSchema.parse({
      sourceId: "demo",
      sourceListingId: "unit-4",
      url: "https://example.com/unit-4",
      title: "Apartments",
      description: "An income restricted community for residents 62+.",
    });
    const guessed = normalize(silent, NOW);
    expect(guessed.incomeRestricted).toBe(true);
    expect(guessed.seniorHousing).toBe(true);

    const stated = RawListingSchema.parse({
      sourceId: "demo",
      sourceListingId: "unit-5",
      url: "https://example.com/unit-5",
      title: "Apartments",
      description: "An income restricted community for residents 62+.",
      incomeRestricted: false,
      seniorHousing: false,
    });
    const kept = normalize(stated, NOW);
    expect(kept.incomeRestricted).toBe(false);
    expect(kept.seniorHousing).toBe(false);
  });

  it("keeps a stated price basis over the inference", () => {
    const stated = RawListingSchema.parse({
      sourceId: "demo",
      sourceListingId: "unit-7",
      url: "https://example.com/unit-7",
      title: "5 bedrooms available in a renovated rowhome",
      price: 850,
      beds: 5,
      priceBasis: "unit",
    });
    expect(normalize(stated, NOW).priceBasis).toBe("unit");

    const silent = RawListingSchema.parse({
      sourceId: "demo",
      sourceListingId: "unit-8",
      url: "https://example.com/unit-8",
      title: "5 bedrooms available in a renovated rowhome",
      price: 850,
      beds: 5,
    });
    expect(normalize(silent, NOW).priceBasis).toBe("room");
  });

  it("carries the bed range through", () => {
    const raw = RawListingSchema.parse({
      sourceId: "demo",
      sourceListingId: "unit-6",
      url: "https://example.com/unit-6",
      title: "Studio to four bedroom apartments",
      beds: 1,
      bedsMax: 4,
      price: 1500,
      priceMax: 4200,
    });
    const normalized = normalize(raw, NOW);
    expect(normalized.beds).toBe(1);
    expect(normalized.bedsMax).toBe(4);
  });

  it("marks a sublet found only in the text", () => {
    const raw = RawListingSchema.parse({
      sourceId: "demo",
      sourceListingId: "unit-3",
      url: "https://example.com/unit-3",
      title: "Spring sublet available",
    });
    expect(normalize(raw, NOW).isSublet).toBe(true);
  });
});
