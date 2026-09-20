import { z } from "zod";
import { AMENITIES, PropertyTypeSchema } from "./listing.ts";

/**
 * must   = hard filter, a listing that fails it never matches
 * prefer = adds to the score when satisfied
 * avoid  = subtracts from the score when present
 * ignore = not considered
 */
export const ImportanceSchema = z.enum(["must", "prefer", "avoid", "ignore"]);
export type Importance = z.infer<typeof ImportanceSchema>;

export const AnchorSchema = z.object({
  label: z.string(),
  lat: z.number(),
  lon: z.number(),
});
export type Anchor = z.infer<typeof AnchorSchema>;

const amenityShape = Object.fromEntries(
  AMENITIES.map((a) => [a, ImportanceSchema.default("ignore")]),
) as Record<(typeof AMENITIES)[number], z.ZodDefault<typeof ImportanceSchema>>;

export const PreferencesSchema = z.object({
  group: z.object({
    // Number of people splitting rent. Drives per-person price and the outreach draft.
    size: z.number().int().min(1).default(1),
  }),
  price: z.object({
    maxTotal: z.number().nullable().default(null),
    maxPerPerson: z.number().nullable().default(null),
    // Score is best at or under this, and decays toward the max
    idealPerPerson: z.number().nullable().default(null),
    // Listings with no price can still match (many landlord sites say "call for price")
    allowUnknown: z.boolean().default(true),
  }),
  beds: z.object({
    min: z.number().default(0),
    max: z.number().nullable().default(null),
    allowUnknown: z.boolean().default(false),
  }),
  baths: z.object({
    min: z.number().default(0),
  }),
  sqft: z.object({
    min: z.number().nullable().default(null),
  }),
  propertyTypes: z.array(PropertyTypeSchema).default([
    "apartment",
    "rowhome",
    "house",
    "condo",
    "unknown",
  ]),
  location: z.object({
    // Walk time is measured from here. Campus presets live in campuses.ts.
    anchor: AnchorSchema,
    maxWalkMinutes: z.number().nullable().default(20),
    idealWalkMinutes: z.number().nullable().default(10),
    // Empty include list = any neighborhood inside the walk radius
    neighborhoodsInclude: z.array(z.string()).default([]),
    neighborhoodsExclude: z.array(z.string()).default([]),
    // Listings that could not be geocoded can still match
    allowUnknown: z.boolean().default(false),
  }),
  dates: z.object({
    // ISO dates. A listing matches when its available date falls inside the window.
    moveInEarliest: z.string().nullable().default(null),
    moveInLatest: z.string().nullable().default(null),
    leaseMonthsMin: z.number().nullable().default(null),
    leaseMonthsMax: z.number().nullable().default(null),
    allowUnknown: z.boolean().default(true),
  }),
  amenities: z.object(amenityShape),
  rules: z.object({
    allowSublets: z.boolean().default(false),
    allowRoomsInSharedUnit: z.boolean().default(false),
    allowIncomeRestricted: z.boolean().default(false),
    allowSeniorHousing: z.boolean().default(false),
    hideSuspectedScams: z.boolean().default(true),
    requirePhotos: z.boolean().default(false),
    maxListingAgeDays: z.number().nullable().default(null),
  }),
  exclusions: z.object({
    // Matched case-insensitively against title, description, address, and landlord
    buildings: z.array(z.string()).default([]),
    addresses: z.array(z.string()).default([]),
    landlords: z.array(z.string()).default([]),
    keywords: z.array(z.string()).default([]),
    sources: z.array(z.string()).default([]),
  }),
  keywords: z.object({
    required: z.array(z.string()).default([]),
    boost: z.array(z.string()).default([]),
  }),
  // Relative weights for the 0 to 100 score. They are normalized, so only ratios matter.
  weights: z.object({
    price: z.number().min(0).default(3),
    distance: z.number().min(0).default(3),
    amenities: z.number().min(0).default(2),
    size: z.number().min(0).default(1),
    freshness: z.number().min(0).default(1),
  }),
  notify: z.object({
    enabled: z.boolean().default(true),
    // ntfy topic for the person who owns this profile. Pushes here carry the Send button.
    topic: z.string().default(""),
    // Optional second topic for roommates. Same pushes without the Send button.
    shareTopic: z.string().default(""),
    minScore: z.number().min(0).max(100).default(50),
    // Score at or above this goes out at ntfy priority 5 (bypasses Do Not Disturb)
    urgentScore: z.number().min(0).max(100).default(85),
    priceDrops: z.boolean().default(true),
    backOnMarket: z.boolean().default(true),
    // "23:00" style local times. Pushes inside the window are held and sent as one digest after it ends.
    quietHours: z
      .object({ start: z.string(), end: z.string() })
      .nullable()
      .default(null),
  }),
  outreach: z.object({
    autoDraft: z.boolean().default(true),
    templateId: z.string().nullable().default(null),
    minScore: z.number().min(0).max(100).default(60),
  }),
});
export type Preferences = z.infer<typeof PreferencesSchema>;
export type PreferencesInput = z.input<typeof PreferencesSchema>;

/** Every nested object is required by the schema, so defaults come from parsing this skeleton. */
export function defaultPreferences(anchor: Anchor): Preferences {
  return PreferencesSchema.parse({
    group: {},
    price: {},
    beds: {},
    baths: {},
    sqft: {},
    location: { anchor },
    dates: {},
    amenities: {},
    rules: {},
    exclusions: {},
    keywords: {},
    weights: {},
    notify: {},
    outreach: {},
  });
}

export const ProfileSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  enabled: z.boolean().default(true),
  color: z.string().default("#2563eb"),
  preferences: PreferencesSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const ProfileWriteSchema = ProfileSchema.pick({
  name: true,
  enabled: true,
  color: true,
  preferences: true,
});
export type ProfileWrite = z.input<typeof ProfileWriteSchema>;

export const FILTER_REASONS = [
  "priceOverMax",
  "priceUnknown",
  "bedsOutOfRange",
  "bedsUnknown",
  "bathsUnderMin",
  "sqftUnderMin",
  "propertyTypeNotAllowed",
  "tooFar",
  "locationUnknown",
  "neighborhoodExcluded",
  "neighborhoodNotIncluded",
  "availabilityOutsideWindow",
  "availabilityUnknown",
  "leaseLengthOutOfRange",
  "missingRequiredAmenity",
  "subletNotAllowed",
  "sharedRoomNotAllowed",
  "incomeRestricted",
  "seniorHousing",
  "suspectedScam",
  "noPhotos",
  "listingTooOld",
  "excludedBuilding",
  "excludedAddress",
  "excludedLandlord",
  "excludedKeyword",
  "excludedSource",
  "missingRequiredKeyword",
] as const;
export const FilterReasonSchema = z.enum(FILTER_REASONS);
export type FilterReason = z.infer<typeof FilterReasonSchema>;

export const ScoreBreakdownSchema = z.object({
  price: z.number(),
  distance: z.number(),
  amenities: z.number(),
  size: z.number(),
  freshness: z.number(),
  keywordBoost: z.number(),
});

/** Result of evaluating one listing against one profile. */
export const MatchSchema = z.object({
  listingId: z.string(),
  profileId: z.string(),
  matched: z.boolean(),
  // Empty when matched. Kept for rejects so the dashboard can explain why a listing is hidden.
  rejectedBy: z.array(FilterReasonSchema),
  score: z.number(),
  breakdown: ScoreBreakdownSchema,
  // Rent for the whole unit as the engine priced it. For a per-room listing this is price times bedrooms.
  monthlyTotal: z.number().nullable().default(null),
  pricePerPerson: z.number().nullable(),
  walkMinutes: z.number().nullable(),
  distanceMiles: z.number().nullable(),
});
export type Match = z.infer<typeof MatchSchema>;
