import type { FilterReason } from "@housing/shared";

/**
 * Plain words for every hard filter. A student reading the "show everything scraped"
 * feed should learn what to loosen, so each line names the setting that rejected it.
 */
const REASONS: Record<FilterReason, string> = {
  priceOverMax: "Costs more than your budget",
  priceUnknown: "No price listed, and you turned off unpriced listings",
  bedsOutOfRange: "Wrong number of bedrooms",
  bedsUnknown: "Bedroom count not listed",
  bathsUnderMin: "Fewer bathrooms than you asked for",
  sqftUnderMin: "Smaller than your minimum square footage",
  propertyTypeNotAllowed: "Not one of the property types you picked",
  tooFar: "Longer walk than your maximum",
  locationUnknown: "Address could not be placed on the map",
  neighborhoodExcluded: "In a neighborhood you excluded",
  neighborhoodNotIncluded: "Outside the neighborhoods you listed",
  availabilityOutsideWindow: "Available outside your move-in window",
  availabilityUnknown: "No move-in date listed",
  leaseLengthOutOfRange: "Lease length does not fit your range",
  missingRequiredAmenity: "Missing an amenity you marked as a must",
  subletNotAllowed: "It is a sublet, and you excluded those",
  sharedRoomNotAllowed: "It is a room in a shared unit, and you excluded those",
  incomeRestricted: "Income restricted housing",
  seniorHousing: "Senior housing",
  suspectedScam: "Flagged as a likely scam",
  noPhotos: "No photos, and you require them",
  listingTooOld: "Posted longer ago than your age limit",
  excludedBuilding: "A building on your exclude list",
  excludedAddress: "An address on your exclude list",
  excludedLandlord: "A landlord on your exclude list",
  excludedKeyword: "Contains a word on your exclude list",
  excludedSource: "From a source you turned off for this profile",
  missingRequiredKeyword: "Missing a word you marked as required",
};

export function rejectReason(reason: FilterReason): string {
  return REASONS[reason];
}

/** The one line shown on a rejected row. Extra reasons are counted, not listed. */
export function rejectSummary(reasons: FilterReason[]): string {
  const [first, ...rest] = reasons;
  if (!first) return "Rejected";
  if (rest.length === 0) return rejectReason(first);
  return `${rejectReason(first)}, and ${rest.length} more ${rest.length === 1 ? "reason" : "reasons"}`;
}

/** The setting a reason points at, used to send the reader to the right editor section. */
const SECTIONS: Record<FilterReason, string> = {
  priceOverMax: "budget",
  priceUnknown: "budget",
  bedsOutOfRange: "size",
  bedsUnknown: "size",
  bathsUnderMin: "size",
  sqftUnderMin: "size",
  propertyTypeNotAllowed: "size",
  tooFar: "location",
  locationUnknown: "location",
  neighborhoodExcluded: "location",
  neighborhoodNotIncluded: "location",
  availabilityOutsideWindow: "dates",
  availabilityUnknown: "dates",
  leaseLengthOutOfRange: "dates",
  missingRequiredAmenity: "amenities",
  subletNotAllowed: "rules",
  sharedRoomNotAllowed: "rules",
  incomeRestricted: "rules",
  seniorHousing: "rules",
  suspectedScam: "rules",
  noPhotos: "rules",
  listingTooOld: "rules",
  excludedBuilding: "exclusions",
  excludedAddress: "exclusions",
  excludedLandlord: "exclusions",
  excludedKeyword: "exclusions",
  excludedSource: "exclusions",
  missingRequiredKeyword: "keywords",
};

export function reasonSection(reason: FilterReason): string {
  return SECTIONS[reason];
}
