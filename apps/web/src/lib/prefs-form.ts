import {
  AMENITIES,
  PreferencesSchema,
  type Amenity,
  type Importance,
  type Preferences,
  type PropertyType,
} from "@housing/shared";

/**
 * The editor holds every number as the string the input actually contains, so a
 * half-typed "1" never collapses to 1 under the user's fingers. Lists are one item
 * per line. fromForm parses the result through PreferencesSchema, so the form can
 * never hand the server a shape the contract does not accept.
 */
export interface PreferencesForm {
  groupSize: string;

  maxTotal: string;
  maxPerPerson: string;
  idealPerPerson: string;
  priceAllowUnknown: boolean;

  bedsMin: string;
  bedsMax: string;
  bedsAllowUnknown: boolean;
  bathsMin: string;
  sqftMin: string;
  propertyTypes: PropertyType[];

  anchorLabel: string;
  anchorLat: string;
  anchorLon: string;
  maxWalkMinutes: string;
  idealWalkMinutes: string;
  neighborhoodsInclude: string;
  neighborhoodsExclude: string;
  locationAllowUnknown: boolean;

  moveInEarliest: string;
  moveInLatest: string;
  leaseMonthsMin: string;
  leaseMonthsMax: string;
  datesAllowUnknown: boolean;

  amenities: Record<Amenity, Importance>;

  allowSublets: boolean;
  allowRoomsInSharedUnit: boolean;
  allowIncomeRestricted: boolean;
  allowSeniorHousing: boolean;
  hideSuspectedScams: boolean;
  requirePhotos: boolean;
  maxListingAgeDays: string;

  excludeBuildings: string;
  excludeAddresses: string;
  excludeLandlords: string;
  excludeKeywords: string;
  excludeSources: string;

  keywordsRequired: string;
  keywordsBoost: string;

  weightPrice: number;
  weightDistance: number;
  weightAmenities: number;
  weightSize: number;
  weightFreshness: number;

  notifyEnabled: boolean;
  notifyTopic: string;
  notifyShareTopic: string;
  notifyMinScore: number;
  notifyUrgentScore: number;
  notifyPriceDrops: boolean;
  notifyBackOnMarket: boolean;
  quietHoursEnabled: boolean;
  quietStart: string;
  quietEnd: string;

  outreachAutoDraft: boolean;
  outreachTemplateId: string;
  outreachMinScore: number;
}

function numToText(value: number | null): string {
  return value === null ? "" : String(value);
}

function textToNum(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function textToNumOr(value: string, fallback: number): number {
  return textToNum(value) ?? fallback;
}

export function listToText(items: string[]): string {
  return items.join("\n");
}

export function textToList(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Adds the value to a newline list, or removes it when it is already there. */
export function toggleLine(text: string, value: string): string {
  const items = textToList(text);
  const lower = value.toLowerCase();
  const without = items.filter((item) => item.toLowerCase() !== lower);
  return listToText(without.length === items.length ? [...items, value] : without);
}

export function hasLine(text: string, value: string): boolean {
  const lower = value.toLowerCase();
  return textToList(text).some((item) => item.toLowerCase() === lower);
}

export function toForm(prefs: Preferences): PreferencesForm {
  return {
    groupSize: String(prefs.group.size),

    maxTotal: numToText(prefs.price.maxTotal),
    maxPerPerson: numToText(prefs.price.maxPerPerson),
    idealPerPerson: numToText(prefs.price.idealPerPerson),
    priceAllowUnknown: prefs.price.allowUnknown,

    bedsMin: String(prefs.beds.min),
    bedsMax: numToText(prefs.beds.max),
    bedsAllowUnknown: prefs.beds.allowUnknown,
    bathsMin: String(prefs.baths.min),
    sqftMin: numToText(prefs.sqft.min),
    propertyTypes: [...prefs.propertyTypes],

    anchorLabel: prefs.location.anchor.label,
    anchorLat: String(prefs.location.anchor.lat),
    anchorLon: String(prefs.location.anchor.lon),
    maxWalkMinutes: numToText(prefs.location.maxWalkMinutes),
    idealWalkMinutes: numToText(prefs.location.idealWalkMinutes),
    neighborhoodsInclude: listToText(prefs.location.neighborhoodsInclude),
    neighborhoodsExclude: listToText(prefs.location.neighborhoodsExclude),
    locationAllowUnknown: prefs.location.allowUnknown,

    moveInEarliest: prefs.dates.moveInEarliest ?? "",
    moveInLatest: prefs.dates.moveInLatest ?? "",
    leaseMonthsMin: numToText(prefs.dates.leaseMonthsMin),
    leaseMonthsMax: numToText(prefs.dates.leaseMonthsMax),
    datesAllowUnknown: prefs.dates.allowUnknown,

    amenities: { ...prefs.amenities },

    allowSublets: prefs.rules.allowSublets,
    allowRoomsInSharedUnit: prefs.rules.allowRoomsInSharedUnit,
    allowIncomeRestricted: prefs.rules.allowIncomeRestricted,
    allowSeniorHousing: prefs.rules.allowSeniorHousing,
    hideSuspectedScams: prefs.rules.hideSuspectedScams,
    requirePhotos: prefs.rules.requirePhotos,
    maxListingAgeDays: numToText(prefs.rules.maxListingAgeDays),

    excludeBuildings: listToText(prefs.exclusions.buildings),
    excludeAddresses: listToText(prefs.exclusions.addresses),
    excludeLandlords: listToText(prefs.exclusions.landlords),
    excludeKeywords: listToText(prefs.exclusions.keywords),
    excludeSources: listToText(prefs.exclusions.sources),

    keywordsRequired: listToText(prefs.keywords.required),
    keywordsBoost: listToText(prefs.keywords.boost),

    weightPrice: prefs.weights.price,
    weightDistance: prefs.weights.distance,
    weightAmenities: prefs.weights.amenities,
    weightSize: prefs.weights.size,
    weightFreshness: prefs.weights.freshness,

    notifyEnabled: prefs.notify.enabled,
    notifyTopic: prefs.notify.topic,
    notifyShareTopic: prefs.notify.shareTopic,
    notifyMinScore: prefs.notify.minScore,
    notifyUrgentScore: prefs.notify.urgentScore,
    notifyPriceDrops: prefs.notify.priceDrops,
    notifyBackOnMarket: prefs.notify.backOnMarket,
    quietHoursEnabled: prefs.notify.quietHours !== null,
    quietStart: prefs.notify.quietHours?.start ?? "23:00",
    quietEnd: prefs.notify.quietHours?.end ?? "08:00",

    outreachAutoDraft: prefs.outreach.autoDraft,
    outreachTemplateId: prefs.outreach.templateId ?? "",
    outreachMinScore: prefs.outreach.minScore,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toShape(form: PreferencesForm): unknown {
  const amenities: Record<string, Importance> = {};
  for (const amenity of AMENITIES) amenities[amenity] = form.amenities[amenity] ?? "ignore";

  return {
    group: { size: Math.max(1, Math.round(textToNumOr(form.groupSize, 1))) },
    price: {
      maxTotal: textToNum(form.maxTotal),
      maxPerPerson: textToNum(form.maxPerPerson),
      idealPerPerson: textToNum(form.idealPerPerson),
      allowUnknown: form.priceAllowUnknown,
    },
    beds: {
      min: textToNumOr(form.bedsMin, 0),
      max: textToNum(form.bedsMax),
      allowUnknown: form.bedsAllowUnknown,
    },
    baths: { min: textToNumOr(form.bathsMin, 0) },
    sqft: { min: textToNum(form.sqftMin) },
    propertyTypes: form.propertyTypes,
    location: {
      anchor: {
        label: form.anchorLabel,
        lat: textToNumOr(form.anchorLat, 0),
        lon: textToNumOr(form.anchorLon, 0),
      },
      maxWalkMinutes: textToNum(form.maxWalkMinutes),
      idealWalkMinutes: textToNum(form.idealWalkMinutes),
      neighborhoodsInclude: textToList(form.neighborhoodsInclude),
      neighborhoodsExclude: textToList(form.neighborhoodsExclude),
      allowUnknown: form.locationAllowUnknown,
    },
    dates: {
      moveInEarliest: form.moveInEarliest.trim() || null,
      moveInLatest: form.moveInLatest.trim() || null,
      leaseMonthsMin: textToNum(form.leaseMonthsMin),
      leaseMonthsMax: textToNum(form.leaseMonthsMax),
      allowUnknown: form.datesAllowUnknown,
    },
    amenities,
    rules: {
      allowSublets: form.allowSublets,
      allowRoomsInSharedUnit: form.allowRoomsInSharedUnit,
      allowIncomeRestricted: form.allowIncomeRestricted,
      allowSeniorHousing: form.allowSeniorHousing,
      hideSuspectedScams: form.hideSuspectedScams,
      requirePhotos: form.requirePhotos,
      maxListingAgeDays: textToNum(form.maxListingAgeDays),
    },
    exclusions: {
      buildings: textToList(form.excludeBuildings),
      addresses: textToList(form.excludeAddresses),
      landlords: textToList(form.excludeLandlords),
      keywords: textToList(form.excludeKeywords),
      sources: textToList(form.excludeSources),
    },
    keywords: {
      required: textToList(form.keywordsRequired),
      boost: textToList(form.keywordsBoost),
    },
    weights: {
      price: Math.max(0, form.weightPrice),
      distance: Math.max(0, form.weightDistance),
      amenities: Math.max(0, form.weightAmenities),
      size: Math.max(0, form.weightSize),
      freshness: Math.max(0, form.weightFreshness),
    },
    notify: {
      enabled: form.notifyEnabled,
      topic: form.notifyTopic.trim(),
      shareTopic: form.notifyShareTopic.trim(),
      minScore: clamp(form.notifyMinScore, 0, 100),
      urgentScore: clamp(form.notifyUrgentScore, 0, 100),
      priceDrops: form.notifyPriceDrops,
      backOnMarket: form.notifyBackOnMarket,
      quietHours: form.quietHoursEnabled
        ? { start: form.quietStart, end: form.quietEnd }
        : null,
    },
    outreach: {
      autoDraft: form.outreachAutoDraft,
      templateId: form.outreachTemplateId.trim() || null,
      minScore: clamp(form.outreachMinScore, 0, 100),
    },
  };
}

export function fromForm(form: PreferencesForm): Preferences {
  return PreferencesSchema.parse(toShape(form));
}

export type FormResult =
  | { ok: true; value: Preferences }
  | { ok: false; message: string };

export function safeFromForm(form: PreferencesForm): FormResult {
  const parsed = PreferencesSchema.safeParse(toShape(form));
  if (parsed.success) return { ok: true, value: parsed.data };
  const first = parsed.error.issues[0];
  return {
    ok: false,
    message: first ? `${first.path.join(".")}: ${first.message}` : "Preferences are not valid",
  };
}
