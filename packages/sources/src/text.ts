import type { Amenity, AmenityMap, PropertyType } from "@housing/shared";

/** "$3,100", "$3,100/mo", "3100" -> 3100. Returns null when there is no number. */
export function parseMoney(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

/** Keeps a number only when it is finite and positive. Sites use 0 and -1 as "unknown". */
export function positive(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

/**
 * A studio is genuinely zero bedrooms, so the low end of a bedroom range is read as a plain
 * number. positive() cannot be used here because it treats zero as unknown.
 */
export function bedCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 30) return null;
  return value;
}

/**
 * bedsMax only says something when one row stands for a building with several floor plans.
 * A single unit repeats its own bed count at both ends of the range, so it stays null.
 */
export function rangeTop(low: unknown, high: unknown): number | null {
  const top = positive(high);
  return top !== null && top !== positive(low) ? top : null;
}

/**
 * Square footage is the field landlords mistype most often. AppFolio serves "21.42" for a
 * one-bedroom apartment, so anything under a closet is treated as unknown.
 */
export function plausibleSqft(value: number | null): number | null {
  if (value === null || value < 100 || value > 20000) return null;
  return Math.round(value);
}

/** ISO timestamp or date string -> YYYY-MM-DD. Returns null on anything unparsable. */
export function isoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export function isoTimestamp(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

const PROPERTY_TYPE_PATTERNS: Array<[RegExp, PropertyType]> = [
  [/\b(row\s?home|row\s?house|townhome|townhouse)\b/i, "rowhome"],
  [/\b(single[- ]family|detached|house|home)\b/i, "house"],
  [/\bcondo(minium)?\b/i, "condo"],
  [/\bstudio\b/i, "studio"],
  [/\b(private )?room\b/i, "room"],
  [/\b(apartment|apt|flat|loft)\b/i, "apartment"],
];

/** Best-effort type from a label the site supplied. The pipeline refines it from the description. */
export function propertyTypeFrom(...labels: Array<string | null | undefined>): PropertyType {
  const text = labels.filter((l): l is string => Boolean(l)).join(" ");
  if (!text) return "unknown";
  for (const [pattern, type] of PROPERTY_TYPE_PATTERNS) {
    if (pattern.test(text)) return type;
  }
  return "unknown";
}

const AMENITY_PATTERNS: Array<[RegExp, Amenity]> = [
  [/\b(in[- ]unit laundry|washer\s*\/?\s*dryer in unit|w\/d in unit)\b/i, "laundryInUnit"],
  [/\b(laundry (room|access|facilit|on[- ]?site)|onsite laundry|laundry in (bldg|building))\b/i, "laundryInBuilding"],
  [/\bdishwasher\b/i, "dishwasher"],
  [/\b(air conditioning|central a\/c|central air|\ba\/c\b)\b/i, "airConditioning"],
  [/\b(parking|garage|carport)\b/i, "parking"],
  [/\bfurnished\b/i, "furnished"],
  [/\bcats?\b.{0,12}\b(ok|allowed|friendly)\b/i, "catsAllowed"],
  [/\bdogs?\b.{0,12}\b(ok|allowed|friendly)\b/i, "dogsAllowed"],
  [/\b(balcony|patio|deck|yard|outdoor space|courtyard|roof ?deck)\b/i, "outdoorSpace"],
  [/\belevator\b/i, "elevator"],
  [/\b(gym|fitness (room|center)|exercise room)\b/i, "gym"],
  [/\b(utilities included|all utilities|all bills included)\b/i, "utilitiesIncluded"],
  [/\b(wheelchair|ada accessible)\b/i, "wheelchairAccessible"],
];

/** Reads amenity labels a site already grouped for us. Silence stays silence, never false. */
export function amenitiesFromLabels(labels: readonly string[]): AmenityMap {
  const map: AmenityMap = {};
  const text = labels.join(" | ");
  for (const [pattern, amenity] of AMENITY_PATTERNS) {
    if (pattern.test(text)) map[amenity] = true;
  }
  return map;
}

/** "4 beds · 2 baths · 1,500 sq ft" and "4BR / 3.5Ba" style summaries. */
export function parseBedBath(text: string): {
  beds: number | null;
  baths: number | null;
  sqft: number | null;
} {
  const beds = text.match(/(\d+(?:\.\d+)?)\s*(?:bd|br|beds?|bedrooms?)\b/i);
  const baths = text.match(/(\d+(?:\.\d+)?)\s*(?:ba|baths?|bathrooms?)\b/i);
  const sqft = text.match(/([\d,]+(?:\.\d+)?)\s*(?:sq\.?\s*ft|sqft|square feet|ft2|ft²)/i);
  return {
    beds: beds ? positive(Number(beds[1])) : null,
    baths: baths ? positive(Number(baths[1])) : null,
    sqft: plausibleSqft(sqft ? parseMoney(sqft[1]) : null),
  };
}

/** Digits only, so the pipeline and the dialer agree on what the number is. */
export function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits.length === 10 ? digits : null;
}
