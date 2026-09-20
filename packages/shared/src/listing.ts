import { z } from "zod";

export const PROPERTY_TYPES = [
  "apartment",
  "rowhome",
  "house",
  "condo",
  "studio",
  "room",
  "unknown",
] as const;
export const PropertyTypeSchema = z.enum(PROPERTY_TYPES);
export type PropertyType = z.infer<typeof PropertyTypeSchema>;

export const AMENITIES = [
  "laundryInUnit",
  "laundryInBuilding",
  "dishwasher",
  "airConditioning",
  "parking",
  "furnished",
  "catsAllowed",
  "dogsAllowed",
  "outdoorSpace",
  "elevator",
  "gym",
  "utilitiesIncluded",
  "wheelchairAccessible",
] as const;
export const AmenitySchema = z.enum(AMENITIES);
export type Amenity = z.infer<typeof AmenitySchema>;

// true = listing says yes, false = listing says no, missing key = listing is silent
export const AmenityMapSchema = z.partialRecord(AmenitySchema, z.boolean());
export type AmenityMap = z.infer<typeof AmenityMapSchema>;

export const ContactSchema = z.object({
  name: z.string().nullable(),
  company: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  // Page where the only way to reach the landlord is a web form or a relay (Craigslist reply, Facebook Messenger)
  formUrl: z.string().nullable(),
});
export type Contact = z.infer<typeof ContactSchema>;

/**
 * What a source adapter returns. Everything except the identity fields is optional
 * because sources differ wildly in what they expose. The pipeline fills the gaps
 * (geocoding, amenity extraction from the description, property type inference).
 */
export const RawListingSchema = z.object({
  sourceId: z.string(),
  sourceListingId: z.string(),
  url: z.string(),
  title: z.string(),
  description: z.string().nullable().default(null),
  price: z.number().nullable().default(null),
  // Some sources give a range for multi-unit buildings
  priceMax: z.number().nullable().default(null),
  beds: z.number().nullable().default(null),
  // Set when one row stands for a building with several floor plans. beds is then the smallest
  // plan and price its rent, bedsMax the largest plan and priceMax its rent.
  bedsMax: z.number().nullable().default(null),
  baths: z.number().nullable().default(null),
  sqft: z.number().nullable().default(null),
  propertyType: PropertyTypeSchema.default("unknown"),
  isSublet: z.boolean().default(false),
  // null = the source does not say. The pipeline then guesses from the description.
  incomeRestricted: z.boolean().nullable().default(null),
  seniorHousing: z.boolean().nullable().default(null),
  address: z.string().nullable().default(null),
  neighborhood: z.string().nullable().default(null),
  zip: z.string().nullable().default(null),
  lat: z.number().nullable().default(null),
  lon: z.number().nullable().default(null),
  // ISO date (YYYY-MM-DD) the unit becomes available
  availableDate: z.string().nullable().default(null),
  leaseMonths: z.number().nullable().default(null),
  photos: z.array(z.string()).default([]),
  amenities: AmenityMapSchema.default({}),
  contact: ContactSchema.partial().default({}),
  // ISO timestamp from the source, if it exposes one
  postedAt: z.string().nullable().default(null),
  sourceUpdatedAt: z.string().nullable().default(null),
});
export type RawListing = z.infer<typeof RawListingSchema>;
export type RawListingInput = z.input<typeof RawListingSchema>;

export const SCAM_SIGNALS = [
  "priceFarBelowArea",
  "wireOrGiftCardLanguage",
  "landlordOutOfCountry",
  "depositBeforeViewing",
  "duplicateTextDifferentAddress",
  "noAddressNoPhotos",
] as const;
export const ScamSignalSchema = z.enum(SCAM_SIGNALS);
export type ScamSignal = z.infer<typeof ScamSignalSchema>;

export const ListingStatusSchema = z.enum(["active", "gone"]);
export type ListingStatus = z.infer<typeof ListingStatusSchema>;

export const PricePointSchema = z.object({ price: z.number(), at: z.string() });

export const SourceLinkSchema = z.object({
  sourceId: z.string(),
  sourceListingId: z.string(),
  url: z.string(),
});
export type SourceLink = z.infer<typeof SourceLinkSchema>;

/** Canonical listing after normalize, enrich, dedupe. One row per physical unit. */
export const ListingSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  price: z.number().nullable(),
  priceMax: z.number().nullable(),
  beds: z.number().nullable(),
  bedsMax: z.number().nullable().default(null),
  baths: z.number().nullable(),
  sqft: z.number().nullable(),
  propertyType: PropertyTypeSchema,
  isSublet: z.boolean(),
  incomeRestricted: z.boolean().default(false),
  seniorHousing: z.boolean().default(false),
  address: z.string().nullable(),
  neighborhood: z.string().nullable(),
  zip: z.string().nullable(),
  lat: z.number().nullable(),
  lon: z.number().nullable(),
  availableDate: z.string().nullable(),
  leaseMonths: z.number().nullable(),
  photos: z.array(z.string()),
  amenities: AmenityMapSchema,
  contact: ContactSchema,
  scamSignals: z.array(ScamSignalSchema),
  // Every place this unit was seen. First entry is the primary source.
  sources: z.array(SourceLinkSchema),
  priceHistory: z.array(PricePointSchema),
  status: ListingStatusSchema,
  postedAt: z.string().nullable(),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
});
export type Listing = z.infer<typeof ListingSchema>;
