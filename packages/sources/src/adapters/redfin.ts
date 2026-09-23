import type { RawListingInput } from "@housing/shared";
import { z } from "zod";
import { decode } from "../decode.ts";
import { bboxPolygon, inArea } from "../geo.ts";
import {
  bedCount,
  isoTimestamp,
  normalizePhone,
  plausibleSqft,
  positive,
  propertyTypeFrom,
  rangeTop,
} from "../text.ts";
import type { SourceAdapter, SourceContext } from "../types.ts";

const SOURCE_ID = "redfin";
const ORIGIN = "https://www.redfin.com";
const RENTALS_API = `${ORIGIN}/stingray/api/v1/search/rentals`;

/**
 * The rentals endpoint is separate from the /stingray/api/gis endpoint that serves sale
 * listings, answers clean JSON with no {}&& prefix, and needs no market id: the bounding box
 * polygon from ctx.area decides the region.
 */

const RangeSchema = z
  .object({ min: z.number().nullable().optional(), max: z.number().nullable().optional() })
  .loose();

const HomeSchema = z.object({
  homeData: z
    .object({
      propertyId: z.string(),
      url: z.string(),
      photosInfo: z
        .object({
          photoRanges: z
            .array(
              z
                .object({
                  startPos: z.number(),
                  endPos: z.number(),
                  version: z.union([z.string(), z.number()]),
                })
                .loose(),
            )
            .optional(),
        })
        .loose()
        .optional(),
      addressInfo: z
        .object({
          formattedStreetLine: z.string().nullable().optional(),
          city: z.string().nullable().optional(),
          zip: z.string().nullable().optional(),
          centroid: z
            .object({
              centroid: z
                .object({
                  latitude: z.number().nullable().optional(),
                  longitude: z.number().nullable().optional(),
                })
                .loose(),
            })
            .loose()
            .optional(),
        })
        .loose()
        .optional(),
    })
    .loose(),
  rentalExtension: z
    .object({
      rentalId: z.string(),
      propertyName: z.string().nullable().optional(),
      description: z.string().nullable().optional(),
      bedRange: RangeSchema.optional(),
      bathRange: RangeSchema.optional(),
      sqftRange: RangeSchema.optional(),
      rentPriceRange: RangeSchema.optional(),
      lastUpdated: z.string().nullable().optional(),
      desktopPhone: z.string().nullable().optional(),
      mlsAgentEmail: z.string().nullable().optional(),
      isIncomeRestricted: z.boolean().nullable().optional(),
      isSeniorLiving: z.boolean().nullable().optional(),
    })
    .loose(),
});

const RentalsSchema = z.object({
  homes: z.array(HomeSchema),
  numMatchedHomes: z.number().optional(),
});

const MAX_PHOTOS = 8;

/** Photo URLs are generated from the position ranges: genIsl.<position>_<version>.jpg. */
export function redfinPhotoUrls(
  rentalId: string,
  ranges: ReadonlyArray<{ startPos: number; endPos: number; version: string | number }>,
): string[] {
  const urls: string[] = [];
  for (const range of ranges) {
    for (let pos = range.startPos; pos <= range.endPos && urls.length < MAX_PHOTOS; pos++) {
      urls.push(
        `https://ssl.cdn-redfin.com/photo/rent/${rentalId}/islphoto/genIsl.${pos}_${range.version}.jpg`,
      );
    }
    if (urls.length >= MAX_PHOTOS) break;
  }
  return urls;
}

/** Redfin prefixes many descriptions with "Property Status: Active", which is noise on a card. */
export function stripStatusPrefix(description: string | null | undefined): string | null {
  if (!description) return null;
  return description.replace(/^\s*property status:\s*[a-z]+\s*/i, "").trim() || null;
}

export function parseRedfinRentals(payload: unknown): RawListingInput[] {
  const parsed = decode(RentalsSchema, payload, "redfin rentals");

  return parsed.homes.map((home) => {
    const { homeData: data, rentalExtension: rental } = home;
    const centroid = data.addressInfo?.centroid?.centroid;
    const url = `${ORIGIN}${data.url}`;
    const title = rental.propertyName || data.addressInfo?.formattedStreetLine || "Redfin rental";

    return {
      sourceId: SOURCE_ID,
      sourceListingId: rental.rentalId,
      url,
      title,
      description: stripStatusPrefix(rental.description),
      price: positive(rental.rentPriceRange?.min),
      priceMax: positive(rental.rentPriceRange?.max),
      beds: bedCount(rental.bedRange?.min),
      bedsMax: rangeTop(rental.bedRange?.min, rental.bedRange?.max),
      baths: positive(rental.bathRange?.min),
      sqft: plausibleSqft(positive(rental.sqftRange?.min)),
      propertyType: propertyTypeFrom(title, data.url),
      address: data.addressInfo?.formattedStreetLine || null,
      zip: data.addressInfo?.zip || null,
      lat: centroid?.latitude ?? null,
      lon: centroid?.longitude ?? null,
      photos: redfinPhotoUrls(rental.rentalId, data.photosInfo?.photoRanges ?? []),
      contact: {
        phone: normalizePhone(rental.desktopPhone),
        email: rental.mlsAgentEmail || null,
        formUrl: url,
      },
      incomeRestricted: rental.isIncomeRestricted ?? null,
      seniorHousing: rental.isSeniorLiving ?? null,
      sourceUpdatedAt: isoTimestamp(rental.lastUpdated),
    } satisfies RawListingInput;
  });
}

export const redfinAdapter: SourceAdapter = {
  id: SOURCE_ID,
  name: "Redfin rentals",
  kind: "http",
  homepage: ORIGIN,
  defaultIntervalSec: 600,
  defaultEnabled: true,
  defaultConfig: {},

  needsSetup: async () => null,

  async search(ctx: SourceContext): Promise<RawListingInput[]> {
    const params = new URLSearchParams({
      al: "1",
      isRentals: "true",
      num_homes: "100",
      ord: "redfin-recommended-asc",
      page_number: "1",
      poly: bboxPolygon(ctx.area),
      sf: "1,2,3,5,6,7",
      start: "0",
      status: "9",
      uipt: "1,2,3,4,5,6,7,8",
      v: "8",
    });
    if (ctx.hints.minBeds !== null) params.set("num_beds", String(ctx.hints.minBeds));
    if (ctx.hints.maxPrice !== null) params.set("max_price", String(ctx.hints.maxPrice));

    const res = await ctx.http.fetch(`${RENTALS_API}?${params.toString()}`, {
      browserHeaders: true,
      headers: { Accept: "application/json", "Sec-Fetch-Dest": "empty", "Sec-Fetch-Mode": "cors" },
      signal: ctx.signal,
    });
    const listings = parseRedfinRentals(await res.json());
    ctx.log.debug("redfin search", { count: listings.length });
    return listings.filter((l) => inArea(ctx.area, l.lat ?? null, l.lon ?? null));
  },
};
