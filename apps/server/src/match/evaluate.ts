import {
  AMENITIES,
  type Amenity,
  type FilterReason,
  type Listing,
  type Match,
  type Preferences,
  type Profile,
} from "@housing/shared";
import { anchorPoint, haversineMiles, walkMinutesForMiles } from "./geo.ts";

/** Score a listing whose price the source does not publish. Straight from the spec. */
const UNKNOWN_PRICE_SCORE = 60;
/** Nothing in the spec covers a listing that could not be geocoded, so it scores neutral. */
const NEUTRAL_SCORE = 50;
const KEYWORD_BOOST_PER_HIT = 5;
const KEYWORD_BOOST_CAP = 15;
const FRESH_HOURS = 1;
const STALE_HOURS = 14 * 24;
const HOUR_MS = 3_600_000;

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Every text the exclusion and keyword lists are matched against, lowercased once. */
function haystack(listing: Listing): string {
  return [listing.title, listing.description, listing.address, listing.contact.name, listing.contact.company]
    .filter((part): part is string => part !== null && part !== "")
    .join("\n")
    .toLowerCase();
}

function containsAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => needle.trim() !== "" && text.includes(needle.trim().toLowerCase()));
}

function amenitiesWith(preferences: Preferences, importance: string): Amenity[] {
  return AMENITIES.filter((amenity) => preferences.amenities[amenity] === importance);
}

function has(listing: Listing, amenity: Amenity): boolean {
  return listing.amenities[amenity] === true;
}

export interface BedPlan {
  /** The bed count the engine scores: the smallest plan inside the overlap. */
  beds: number | null;
  /** Rent for that bed count, interpolated across the building's range. */
  rent: number | null;
  /** False when the building's bed range misses the profile's range entirely. */
  overlaps: boolean;
}

/**
 * One row can stand for a whole building. beds and price describe the smallest floor plan,
 * bedsMax and priceMax the largest, and everything between is a straight line.
 */
export function resolveBedPlan(listing: Listing, range: { min: number; max: number | null }): BedPlan {
  if (listing.beds === null) return { beds: null, rent: listing.price, overlaps: true };

  const low = listing.beds;
  const high = listing.bedsMax === null ? low : Math.max(low, listing.bedsMax);
  const wantedHigh = range.max ?? Infinity;
  const overlapLow = Math.max(low, range.min);
  const overlapHigh = Math.min(high, wantedHigh);
  const overlaps = overlapLow <= overlapHigh;
  const beds = overlaps ? overlapLow : low;

  let rent = listing.price;
  if (rent !== null && high > low) {
    const top = listing.priceMax ?? rent;
    rent = rent + (top - rent) * ((beds - low) / (high - low));
  }
  return { beds, rent, overlaps };
}

export function perPersonPrice(rent: number | null, propertyType: Listing["propertyType"], groupSize: number): number | null {
  if (rent === null) return null;
  // A room is already one person's share, so it is not divided again.
  if (propertyType === "room") return rent;
  return rent / Math.max(1, groupSize);
}

export function priceScore(perPerson: number | null, ideal: number | null, max: number | null): number {
  if (perPerson === null) return UNKNOWN_PRICE_SCORE;
  if (ideal === null && max === null) return NEUTRAL_SCORE;
  const low = ideal ?? 0;
  const high = max ?? low;
  if (perPerson <= low) return 100;
  if (high <= low || perPerson >= high) return 40;
  return 100 - 60 * ((perPerson - low) / (high - low));
}

export function distanceScore(walkMinutes: number | null, ideal: number | null, max: number | null): number {
  if (walkMinutes === null) return NEUTRAL_SCORE;
  if (ideal === null && max === null) return NEUTRAL_SCORE;
  const low = ideal ?? 0;
  const high = max ?? low;
  if (walkMinutes <= low) return 100;
  if (high <= low || walkMinutes >= high) return 30;
  return 100 - 70 * ((walkMinutes - low) / (high - low));
}

export function amenityScore(listing: Listing, preferences: Preferences): number {
  const preferred = amenitiesWith(preferences, "prefer");
  const avoided = amenitiesWith(preferences, "avoid");
  const preferredShare =
    preferred.length === 0 ? null : preferred.filter((a) => has(listing, a)).length / preferred.length;
  const avoidedShare = avoided.length === 0 ? 0 : avoided.filter((a) => has(listing, a)).length / avoided.length;
  const base = preferredShare === null ? NEUTRAL_SCORE : preferredShare * 100;
  return clamp(base - avoidedShare * 100, 0, 100);
}

export function sizeScore(beds: number | null, minBeds: number): number {
  if (beds === null) return NEUTRAL_SCORE;
  return clamp(100 - 10 * (beds - minBeds), 0, 100);
}

export function freshnessScore(firstSeenAt: string, now: Date): number {
  const hours = (now.getTime() - Date.parse(firstSeenAt)) / HOUR_MS;
  if (!Number.isFinite(hours) || hours <= FRESH_HOURS) return 100;
  if (hours >= STALE_HOURS) return 20;
  return 100 - 80 * ((hours - FRESH_HOURS) / (STALE_HOURS - FRESH_HOURS));
}

function daysBetween(fromIso: string, now: Date): number {
  return (now.getTime() - Date.parse(fromIso)) / (24 * HOUR_MS);
}

function hardFilters(
  listing: Listing,
  preferences: Preferences,
  now: Date,
  plan: BedPlan,
  perPerson: number | null,
  walkMinutes: number | null,
  text: string,
): FilterReason[] {
  const reasons: FilterReason[] = [];
  const { price, beds, baths, sqft, location, dates, rules, exclusions, keywords } = preferences;

  if (plan.rent === null) {
    if (!price.allowUnknown) reasons.push("priceUnknown");
  } else {
    const overTotal = price.maxTotal !== null && plan.rent > price.maxTotal;
    const overPerPerson = price.maxPerPerson !== null && perPerson !== null && perPerson > price.maxPerPerson;
    if (overTotal || overPerPerson) reasons.push("priceOverMax");
  }

  if (listing.beds === null) {
    if (!beds.allowUnknown) reasons.push("bedsUnknown");
  } else if (!plan.overlaps) {
    reasons.push("bedsOutOfRange");
  }

  if (listing.baths !== null && listing.baths < baths.min) reasons.push("bathsUnderMin");
  if (sqft.min !== null && listing.sqft !== null && listing.sqft < sqft.min) reasons.push("sqftUnderMin");
  if (!preferences.propertyTypes.includes(listing.propertyType)) reasons.push("propertyTypeNotAllowed");

  const located = listing.lat !== null && listing.lon !== null;
  if (!located && !location.allowUnknown) reasons.push("locationUnknown");
  if (walkMinutes !== null && location.maxWalkMinutes !== null && walkMinutes > location.maxWalkMinutes) {
    reasons.push("tooFar");
  }

  const neighborhood = listing.neighborhood?.toLowerCase() ?? null;
  const excluded = location.neighborhoodsExclude.map((n) => n.toLowerCase());
  const included = location.neighborhoodsInclude.map((n) => n.toLowerCase());
  if (neighborhood !== null && excluded.includes(neighborhood)) reasons.push("neighborhoodExcluded");
  // An include list is a whitelist, so a listing with no neighborhood cannot satisfy it.
  if (included.length > 0 && (neighborhood === null || !included.includes(neighborhood))) {
    reasons.push("neighborhoodNotIncluded");
  }

  const wantsWindow = dates.moveInEarliest !== null || dates.moveInLatest !== null;
  if (listing.availableDate === null) {
    if (wantsWindow && !dates.allowUnknown) reasons.push("availabilityUnknown");
  } else {
    const early = dates.moveInEarliest !== null && listing.availableDate < dates.moveInEarliest;
    const late = dates.moveInLatest !== null && listing.availableDate > dates.moveInLatest;
    if (early || late) reasons.push("availabilityOutsideWindow");
  }

  if (listing.leaseMonths !== null) {
    const short = dates.leaseMonthsMin !== null && listing.leaseMonths < dates.leaseMonthsMin;
    const long = dates.leaseMonthsMax !== null && listing.leaseMonths > dates.leaseMonthsMax;
    if (short || long) reasons.push("leaseLengthOutOfRange");
  }

  if (amenitiesWith(preferences, "must").some((amenity) => !has(listing, amenity))) {
    reasons.push("missingRequiredAmenity");
  }

  if (listing.isSublet && !rules.allowSublets) reasons.push("subletNotAllowed");
  if (listing.propertyType === "room" && !rules.allowRoomsInSharedUnit) reasons.push("sharedRoomNotAllowed");
  if (!rules.allowIncomeRestricted && listing.incomeRestricted) reasons.push("incomeRestricted");
  if (!rules.allowSeniorHousing && listing.seniorHousing) reasons.push("seniorHousing");
  if (rules.hideSuspectedScams && listing.scamSignals.length > 0) reasons.push("suspectedScam");
  if (rules.requirePhotos && listing.photos.length === 0) reasons.push("noPhotos");
  if (rules.maxListingAgeDays !== null) {
    const age = daysBetween(listing.postedAt ?? listing.firstSeenAt, now);
    if (age > rules.maxListingAgeDays) reasons.push("listingTooOld");
  }

  if (containsAny(text, exclusions.buildings)) reasons.push("excludedBuilding");
  if (containsAny(text, exclusions.addresses)) reasons.push("excludedAddress");
  if (containsAny(text, exclusions.landlords)) reasons.push("excludedLandlord");
  if (containsAny(text, exclusions.keywords)) reasons.push("excludedKeyword");
  if (listing.sources.some((s) => exclusions.sources.includes(s.sourceId))) reasons.push("excludedSource");
  if (keywords.required.length > 0 && !keywords.required.every((k) => text.includes(k.trim().toLowerCase()))) {
    reasons.push("missingRequiredKeyword");
  }

  return reasons;
}

/**
 * Pure. `walkMinutesOverride` lets the pipeline pass a routed pedestrian time from Valhalla;
 * without it the haversine fallback applies, which is what the tests and the dashboard use.
 */
export function evaluate(
  listing: Listing,
  profile: Profile,
  now: Date,
  walkMinutesOverride?: number | null,
): Match {
  const preferences = profile.preferences;
  const plan = resolveBedPlan(listing, preferences.beds);
  const perPerson = perPersonPrice(plan.rent, listing.propertyType, preferences.group.size);

  let distanceMiles: number | null = null;
  if (listing.lat !== null && listing.lon !== null) {
    distanceMiles = haversineMiles(
      { lat: listing.lat, lon: listing.lon },
      anchorPoint(preferences.location.anchor),
    );
  }
  const walkMinutes =
    walkMinutesOverride !== undefined && walkMinutesOverride !== null
      ? walkMinutesOverride
      : distanceMiles === null
        ? null
        : walkMinutesForMiles(distanceMiles);

  const text = haystack(listing);
  const rejectedBy = hardFilters(listing, preferences, now, plan, perPerson, walkMinutes, text);

  const breakdown = {
    price: round(priceScore(perPerson, preferences.price.idealPerPerson, preferences.price.maxPerPerson)),
    distance: round(
      distanceScore(walkMinutes, preferences.location.idealWalkMinutes, preferences.location.maxWalkMinutes),
    ),
    amenities: round(amenityScore(listing, preferences)),
    size: round(sizeScore(plan.beds, preferences.beds.min)),
    freshness: round(freshnessScore(listing.firstSeenAt, now)),
    keywordBoost: Math.min(
      KEYWORD_BOOST_CAP,
      KEYWORD_BOOST_PER_HIT * preferences.keywords.boost.filter((k) => containsAny(text, [k])).length,
    ),
  };

  const weights = preferences.weights;
  const totalWeight = weights.price + weights.distance + weights.amenities + weights.size + weights.freshness;
  const weighted =
    totalWeight === 0
      ? (breakdown.price + breakdown.distance + breakdown.amenities + breakdown.size + breakdown.freshness) / 5
      : (breakdown.price * weights.price +
          breakdown.distance * weights.distance +
          breakdown.amenities * weights.amenities +
          breakdown.size * weights.size +
          breakdown.freshness * weights.freshness) /
        totalWeight;

  return {
    listingId: listing.id,
    profileId: profile.id,
    matched: rejectedBy.length === 0,
    rejectedBy,
    score: Math.round(clamp(weighted + breakdown.keywordBoost, 0, 100) * 10) / 10,
    breakdown,
    pricePerPerson: perPerson === null ? null : round(perPerson),
    walkMinutes: walkMinutes === null ? null : round(walkMinutes),
    distanceMiles: distanceMiles === null ? null : round(distanceMiles),
  };
}
