import type { AmenityMap, Contact, Listing, RawListing } from "@housing/shared";
import {
  addressKey,
  cleanAddress,
  extractAmenities,
  extractAvailableDate,
  extractEmail,
  extractLeaseMonths,
  extractPhone,
  inferPropertyType,
  detectIncomeRestricted,
  detectSeniorHousing,
} from "./text.ts";

/** Everything the pipeline knows about a unit before it is matched against stored listings. */
export type NormalizedListing = Omit<
  Listing,
  "id" | "sources" | "scamSignals" | "priceHistory" | "status" | "firstSeenAt" | "lastSeenAt"
> & {
  addressKey: string | null;
  sourceId: string;
  sourceListingId: string;
  url: string;
};

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** The source asserted these, so they win over anything read out of the description. */
function mergeAmenities(asserted: AmenityMap, extracted: AmenityMap): AmenityMap {
  return { ...extracted, ...asserted };
}

function mergeContact(asserted: Partial<Contact>, text: string): Contact {
  return {
    name: asserted.name ?? null,
    company: asserted.company ?? null,
    email: asserted.email ?? extractEmail(text),
    phone: asserted.phone ?? extractPhone(text),
    formUrl: asserted.formUrl ?? null,
  };
}

export function normalize(raw: RawListing, now: Date): NormalizedListing {
  const description = raw.description === null ? null : collapse(raw.description);
  const text = [raw.title, description].filter((part): part is string => part !== null).join("\n");

  return {
    title: collapse(raw.title),
    description,
    price: raw.price,
    priceMax: raw.priceMax,
    beds: raw.beds,
    bedsMax: raw.bedsMax,
    baths: raw.baths,
    sqft: raw.sqft,
    propertyType: raw.propertyType === "unknown" ? (inferPropertyType(text) ?? "unknown") : raw.propertyType,
    isSublet: raw.isSublet || /\bsublet\b|\bsubleas/i.test(text),
    // A source that states the flag is trusted. The wording check only fills a silence.
    incomeRestricted: raw.incomeRestricted ?? detectIncomeRestricted(text),
    seniorHousing: raw.seniorHousing ?? detectSeniorHousing(text),
    address: cleanAddress(raw.address),
    addressKey: addressKey(raw.address),
    neighborhood: raw.neighborhood,
    zip: raw.zip,
    lat: raw.lat,
    lon: raw.lon,
    availableDate: raw.availableDate ?? extractAvailableDate(text, now),
    leaseMonths: raw.leaseMonths ?? extractLeaseMonths(text),
    photos: raw.photos,
    amenities: mergeAmenities(raw.amenities, extractAmenities(text)),
    contact: mergeContact(raw.contact, text),
    postedAt: raw.postedAt,
    sourceId: raw.sourceId,
    sourceListingId: raw.sourceListingId,
    url: raw.url,
  };
}
