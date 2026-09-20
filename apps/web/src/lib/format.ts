import type {
  Amenity,
  ComposeVia,
  PriceBasis,
  PropertyType,
  ScamSignal,
} from "@housing/shared";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Price on request";
  return money.format(Math.round(value));
}

export function formatPriceRange(price: number | null, priceMax: number | null): string {
  if (price === null) return "Price on request";
  if (priceMax !== null && priceMax > price) {
    return `${money.format(Math.round(price))} to ${money.format(Math.round(priceMax))}`;
  }
  return money.format(Math.round(price));
}

export function formatPerRoom(price: number | null): string {
  if (price === null) return "Price on request";
  return `${money.format(Math.round(price))} per room`;
}

/**
 * Student row homes are often advertised by the bedroom. Showing that number where the
 * rent goes would make a house look half price, so the whole-unit total from the match
 * is the headline and the per-room price becomes a label beside it.
 */
export function headlinePrice(
  price: number | null,
  priceMax: number | null,
  priceBasis: PriceBasis,
  monthlyTotal: number | null,
): { headline: string; perRoom: string | null } {
  if (priceBasis !== "room") {
    return { headline: formatPriceRange(price, priceMax), perRoom: null };
  }
  if (monthlyTotal !== null) {
    return {
      headline: formatMoney(monthlyTotal),
      perRoom: price === null ? null : formatPerRoom(price),
    };
  }
  return { headline: formatPerRoom(price), perRoom: null };
}

const PRICE_BASIS_LABELS: Record<PriceBasis, string> = {
  unit: "Whole unit",
  room: "Per room",
};

export function priceBasisLabel(basis: PriceBasis): string {
  return PRICE_BASIS_LABELS[basis];
}

/** The one sentence a per-room listing needs so the headline number is not a surprise. */
export function perRoomNote(price: number | null, beds: number | null): string {
  const each = price === null ? "the per-room price" : money.format(Math.round(price));
  const rooms = beds === null ? "every bedroom" : `${beds} bedrooms`;
  return `This landlord quotes a price for each bedroom. The total above is ${each} across ${rooms}.`;
}

export function formatPerPerson(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Split unknown";
  return `${money.format(Math.round(value))} each`;
}

export function formatBeds(beds: number | null): string {
  if (beds === null) return "Beds unknown";
  if (beds === 0) return "Studio";
  return `${beds} bd`;
}

/**
 * One row can stand for a whole building, where beds is the smallest floor plan and
 * bedsMax the largest. Say the range rather than the smallest plan alone.
 */
export function formatBedRange(beds: number | null, bedsMax: number | null): string {
  if (beds === null) return formatBeds(bedsMax);
  if (bedsMax === null || bedsMax <= beds) return formatBeds(beds);
  const low = beds === 0 ? "Studio" : String(beds);
  return `${low} to ${bedsMax} bd`;
}

export function isRangedBuilding(
  beds: number | null,
  bedsMax: number | null,
  price: number | null,
  priceMax: number | null,
): boolean {
  return (bedsMax !== null && beds !== null && bedsMax > beds) ||
    (priceMax !== null && price !== null && priceMax > price);
}

export function formatBaths(baths: number | null): string {
  if (baths === null) return "Baths unknown";
  const rounded = Math.round(baths * 10) / 10;
  return `${rounded} ba`;
}

export function formatSqft(sqft: number | null): string {
  if (sqft === null) return "Size unknown";
  return `${new Intl.NumberFormat("en-US").format(sqft)} sq ft`;
}

export function formatWalk(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) {
    return "Walk time unknown";
  }
  return `${Math.round(minutes)} min walk`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "4m ago" style. Falls back to a date once a listing is older than a week. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "unknown";
  const delta = now.getTime() - then;
  if (delta < 0) return "just now";
  if (delta < MINUTE) return "just now";
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)}m ago`;
  if (delta < DAY) return `${Math.floor(delta / HOUR)}h ago`;
  if (delta < 7 * DAY) return `${Math.floor(delta / DAY)}d ago`;
  return formatDate(iso);
}

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** ISO date (YYYY-MM-DD) or timestamp to "Aug 1". Dates are read as UTC so they do not shift. */
export function formatDate(iso: string | null): string {
  if (!iso) return "unknown";
  const value = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00Z` : iso;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return "unknown";
  return dateFmt.format(new Date(ms));
}

const timeFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function formatDateTime(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "unknown";
  return timeFmt.format(new Date(ms));
}

export function formatAvailable(iso: string | null): string {
  if (!iso) return "Move-in date not listed";
  return `Available ${formatDate(iso)}`;
}

export function formatLease(months: number | null): string {
  if (months === null) return "Lease length not listed";
  return `${months} month lease`;
}

export function formatInterval(seconds: number): string {
  if (seconds < 60) return `${seconds} sec`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  const hours = seconds / 3600;
  return `${Math.round(hours * 10) / 10} hr`;
}

/** Four bands so the score reads as a judgement, not a number to compare precisely. */
export type ScoreBand = 0 | 1 | 2 | 3;

export function scoreBand(score: number): ScoreBand {
  if (score >= 80) return 3;
  if (score >= 60) return 2;
  if (score >= 40) return 1;
  return 0;
}

export function scoreWord(score: number): string {
  switch (scoreBand(score)) {
    case 3:
      return "Strong fit";
    case 2:
      return "Good fit";
    case 1:
      return "Loose fit";
    default:
      return "Weak fit";
  }
}

const PROPERTY_LABELS: Record<PropertyType, string> = {
  apartment: "Apartment",
  rowhome: "Row home",
  house: "House",
  condo: "Condo",
  studio: "Studio",
  room: "Room in a shared unit",
  unknown: "Type not listed",
};

export function propertyLabel(type: PropertyType): string {
  return PROPERTY_LABELS[type];
}

const AMENITY_LABELS: Record<Amenity, string> = {
  laundryInUnit: "Laundry in unit",
  laundryInBuilding: "Laundry in building",
  dishwasher: "Dishwasher",
  airConditioning: "Air conditioning",
  parking: "Parking",
  furnished: "Furnished",
  catsAllowed: "Cats allowed",
  dogsAllowed: "Dogs allowed",
  outdoorSpace: "Outdoor space",
  elevator: "Elevator",
  gym: "Gym",
  utilitiesIncluded: "Utilities included",
  wheelchairAccessible: "Wheelchair accessible",
};

export function amenityLabel(amenity: Amenity): string {
  return AMENITY_LABELS[amenity];
}

const SCAM_LABELS: Record<ScamSignal, string> = {
  priceFarBelowArea: "Priced far below everything nearby",
  wireOrGiftCardLanguage: "Asks for a wire transfer or gift cards",
  landlordOutOfCountry: "Landlord says they are out of the country",
  depositBeforeViewing: "Wants a deposit before you see it",
  duplicateTextDifferentAddress: "Same text posted at a different address",
  noAddressNoPhotos: "No address and no photos",
};

export function scamLabel(signal: ScamSignal): string {
  return SCAM_LABELS[signal];
}

const SOURCE_LABELS: Record<string, string> = {
  "jhu-och": "JHU Off-Campus Housing",
  craigslist: "Craigslist",
  appfolio: "AppFolio landlords",
  apartmentlist: "Apartment List",
  redfin: "Redfin rentals",
  zumper: "Zumper",
  rentcom: "Rent.com",
  "facebook-marketplace": "Facebook Marketplace",
  "facebook-groups": "Facebook housing groups",
  demo: "Demo",
};

export function sourceLabel(id: string): string {
  return SOURCE_LABELS[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

/** Digits only, so tel: links work whatever the source formatted it as. */
export function telHref(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `tel:${digits.length === 11 && digits.startsWith("1") ? `+${digits}` : digits}`;
}

export function smsHref(phone: string, body: string): string {
  const digits = phone.replace(/\D/g, "");
  return `sms:${digits}?&body=${encodeURIComponent(body)}`;
}

export function mailtoHref(email: string, subject: string, body: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function pluralize(count: number, one: string, many: string): string {
  return count === 1 ? `${count} ${one}` : `${count} ${many}`;
}

/**
 * Feed rows are read at a glance on a phone, and every listing is in the same city, so a
 * trailing ", Baltimore, MD 21218" costs half the line and says nothing. Only that exact
 * shape is dropped; a unit number or anything unusual is left alone.
 */
const CITY_STATE_ZIP = /,\s*[A-Za-z][A-Za-z .'-]*,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\s*$/;

export function shortAddress(address: string): string {
  return address.replace(CITY_STATE_ZIP, "").trim();
}

const COMPOSE_LABELS: Record<ComposeVia, string> = {
  mailto: "Open in mail app",
  outlook: "Open in Outlook",
  gmail: "Open in Gmail",
};

export function composeLabel(via: ComposeVia): string {
  return COMPOSE_LABELS[via];
}

const COMPOSE_HINTS: Record<ComposeVia, string> = {
  mailto: "Your device's mail app. This is the one that works from a push on your phone.",
  outlook: "Outlook on the web, which is what a Hopkins account uses.",
  gmail: "Gmail on the web.",
};

export function composeHint(via: ComposeVia): string {
  return COMPOSE_HINTS[via];
}

/** Outlook is the safe default for a school address; anything else opens the device's mail app. */
export function suggestComposeVia(email: string): ComposeVia {
  const trimmed = email.trim().toLowerCase();
  if (trimmed.endsWith(".edu")) return "outlook";
  return "mailto";
}
