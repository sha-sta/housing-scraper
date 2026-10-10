import type { FilterReason, Preferences } from "@housing/shared";
import { formatMoney, pluralize } from "./format.ts";

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

/** Every reason, in plain words. A reader deciding what to loosen needs all of them. */
export function rejectList(reasons: FilterReason[]): string {
  if (reasons.length === 0) return "Rejected";
  return reasons.map(rejectReason).join(", ");
}

/** The phone has one line to spare, so the tail becomes a count. */
export function rejectListShort(reasons: FilterReason[], limit = 3): string {
  if (reasons.length === 0) return "Rejected";
  if (reasons.length <= limit) return rejectList(reasons);
  const shown = reasons.slice(0, limit).map(rejectReason).join(", ");
  return `${shown}, +${reasons.length - limit} more`;
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

/**
 * One concrete loosening for a reason, in the words the profile editor uses for that
 * setting. Numbers move by one ordinary step so the suggestion is something to tap in,
 * not an instruction to go think about it.
 */
export function loosenSuggestion(reason: FilterReason, prefs: Preferences): string {
  switch (reason) {
    case "priceOverMax": {
      if (prefs.price.maxPerPerson !== null) {
        return `Try ${formatMoney(prefs.price.maxPerPerson + 100)} each.`;
      }
      if (prefs.price.maxTotal !== null) {
        return `Try ${formatMoney(prefs.price.maxTotal + 500)} in total.`;
      }
      return "Try raising your budget.";
    }
    case "priceUnknown":
      return "Try keeping listings with no price.";
    case "bedsOutOfRange": {
      if (prefs.beds.min > 0) {
        return `Try ${pluralize(prefs.beds.min - 1, "bedroom", "bedrooms")} as the minimum.`;
      }
      if (prefs.beds.max !== null) {
        return `Try ${pluralize(prefs.beds.max + 1, "bedroom", "bedrooms")} as the maximum.`;
      }
      return "Try widening the bedroom range.";
    }
    case "bedsUnknown":
      return "Try keeping listings with no bedroom count.";
    case "bathsUnderMin": {
      const next = Math.max(0, prefs.baths.min - 0.5);
      return `Try ${pluralize(next, "bathroom", "bathrooms")} as the minimum.`;
    }
    case "sqftUnderMin": {
      if (prefs.sqft.min !== null && prefs.sqft.min > 200) {
        return `Try ${prefs.sqft.min - 200} square feet as the minimum.`;
      }
      return "Try dropping the square footage minimum.";
    }
    case "propertyTypeNotAllowed":
      return "Try adding another property type.";
    case "tooFar": {
      if (prefs.location.maxWalkMinutes !== null) {
        return `Try ${prefs.location.maxWalkMinutes + 5} minutes.`;
      }
      return "Try raising your walk limit.";
    }
    case "locationUnknown":
      return "Try keeping listings that could not be placed on the map.";
    case "neighborhoodExcluded":
      return "Try taking a neighborhood off your never list.";
    case "neighborhoodNotIncluded":
      return "Try clearing your neighborhood list.";
    case "availabilityOutsideWindow":
      return "Try widening your move-in window.";
    case "availabilityUnknown":
      return "Try keeping listings with no move-in date.";
    case "leaseLengthOutOfRange":
      return "Try widening your lease length range.";
    case "missingRequiredAmenity":
      return "Try moving one must amenity to prefer.";
    case "subletNotAllowed":
      return "Try allowing sublets.";
    case "sharedRoomNotAllowed":
      return "Try allowing a room in a shared unit.";
    case "incomeRestricted":
      return "Try allowing income restricted housing.";
    case "seniorHousing":
      return "Try allowing senior housing.";
    case "suspectedScam":
      return "Try showing suspected scams with their warning.";
    case "noPhotos":
      return "Try turning off the photo requirement.";
    case "listingTooOld": {
      if (prefs.rules.maxListingAgeDays !== null) {
        return `Try ${pluralize(prefs.rules.maxListingAgeDays * 2, "day", "days")} as the age limit.`;
      }
      return "Try dropping the age limit.";
    }
    case "excludedBuilding":
      return "Try taking a building off your exclude list.";
    case "excludedAddress":
      return "Try taking an address off your exclude list.";
    case "excludedLandlord":
      return "Try taking a landlord off your exclude list.";
    case "excludedKeyword":
      return "Try taking a word off your exclude list.";
    case "excludedSource":
      return "Try turning a source back on for this profile.";
    case "missingRequiredKeyword":
      return "Try removing a required word.";
  }
}

/**
 * The one thing worth loosening when a profile matches nothing. Only the top reason, so
 * the reader has a single move to make rather than a list to work through.
 */
export function loosenHint(
  topRejectReasons: readonly (readonly [FilterReason, number])[],
  prefs: Preferences,
): string | null {
  const top = topRejectReasons[0];
  if (!top) return null;
  const [reason, count] = top;
  if (count <= 0) return null;
  const stopped = `${rejectReason(reason)} stopped ${pluralize(count, "listing", "listings")}.`;
  return `${stopped} ${loosenSuggestion(reason, prefs)}`;
}
