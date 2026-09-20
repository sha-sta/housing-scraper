import type { RawListingInput } from "@housing/shared";
import { z } from "zod";
import { decode, found } from "../decode.ts";
import { inArea } from "../geo.ts";
import {
  amenitiesFromLabels,
  bedCount,
  isoDate,
  isoTimestamp,
  normalizePhone,
  plausibleSqft,
  positive,
  propertyTypeFrom,
  rangeTop,
} from "../text.ts";
import type { SourceAdapter, SourceContext } from "../types.ts";

const SOURCE_ID = "rentcom";
const ORIGIN = "https://www.rent.com";

/**
 * rent.com is a Next.js page. Its __NEXT_DATA__ holds both the property cards and a
 * filterMatchResults array narrowed to the bedroom count in the path, so the two are joined
 * by listing id to get beds, baths, sqft and price that actually match the search.
 */

const RangeSchema = z
  .object({ low: z.number().nullable().optional(), high: z.number().nullable().optional() })
  .loose();

const ListingSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    urlPathname: z.string(),
    propertyType: z.string().nullable().optional(),
    addressFull: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    zipCode: z.string().nullable().optional(),
    updatedAt: z.string().nullable().optional(),
    phoneDesktopText: z.string().nullable().optional(),
    propertyManagementCompany: z
      .object({ name: z.string().nullable().optional() })
      .loose()
      .nullable()
      .optional(),
    incomeRestrictions: z.array(z.unknown()).nullable().optional(),
    amenitiesHighlighted: z.array(z.string()).optional(),
    optimizedPhotos: z.array(z.object({ id: z.string() }).loose()).optional(),
    location: z
      .object({
        lat: z.number().nullable().optional(),
        lng: z.number().nullable().optional(),
        city: z.string().nullable().optional(),
        zip: z.string().nullable().optional(),
      })
      .loose()
      .optional(),
  })
  .loose();

const MatchSchema = z
  .object({
    listingId: z.string(),
    availableDate: z.string().nullable().optional(),
    prices: RangeSchema.optional(),
    beds: RangeSchema.optional(),
    baths: RangeSchema.optional(),
    sqFtRange: z
      .object({ min: z.number().nullable().optional(), max: z.number().nullable().optional() })
      .loose()
      .optional(),
  })
  .loose();

const NextDataSchema = z.object({
  props: z.object({
    pageProps: z.object({
      pageData: z.object({
        location: z.object({
          listingSearch: z.object({
            listings: z.array(ListingSchema),
            filterMatchResults: z.array(MatchSchema).optional(),
          }),
        }),
      }),
    }),
  }),
});

export function extractNextData(html: string): unknown {
  const match = found(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html),
    "rentcom page",
    "__NEXT_DATA__ script",
  );
  return JSON.parse(found(match[1], "rentcom page", "__NEXT_DATA__ body"));
}

export function parseRentcomSearch(html: string): RawListingInput[] {
  const parsed = decode(NextDataSchema, extractNextData(html), "rentcom search");
  const search = parsed.props.pageProps.pageData.location.listingSearch;
  const matches = new Map((search.filterMatchResults ?? []).map((m) => [m.listingId, m]));

  return search.listings.map((listing) => {
    const match = matches.get(listing.id);
    const url = `${ORIGIN}${listing.urlPathname}`;
    const photos = (listing.optimizedPhotos ?? [])
      .slice(0, 12)
      .map((photo) => `https://i.rent.com/t_3x2_fixed_webp_lg/${photo.id}`);

    return {
      sourceId: SOURCE_ID,
      sourceListingId: listing.id,
      url,
      title: listing.name,
      price: positive(match?.prices?.low),
      priceMax: positive(match?.prices?.high),
      // The matched slice is the plans that satisfy the bedroom filter in the path, so its
      // low and high ends are the cheapest and largest plans a searcher could actually rent.
      beds: bedCount(match?.beds?.low),
      bedsMax: rangeTop(match?.beds?.low, match?.beds?.high),
      baths: positive(match?.baths?.low),
      sqft: plausibleSqft(positive(match?.sqFtRange?.min)),
      propertyType: propertyTypeFrom(listing.propertyType, listing.name),
      address: listing.addressFull || listing.address || null,
      zip: listing.zipCode || listing.location?.zip || null,
      lat: listing.location?.lat ?? null,
      lon: listing.location?.lng ?? null,
      availableDate: isoDate(match?.availableDate),
      photos,
      amenities: amenitiesFromLabels(listing.amenitiesHighlighted ?? []),
      contact: {
        company: listing.propertyManagementCompany?.name || null,
        phone: normalizePhone(listing.phoneDesktopText),
        formUrl: url,
      },
      incomeRestricted: listing.incomeRestrictions
        ? listing.incomeRestrictions.length > 0
        : null,
      sourceUpdatedAt: isoTimestamp(listing.updatedAt),
    } satisfies RawListingInput;
  });
}

function pathsFrom(config: Record<string, unknown>): string[] {
  const value = config["paths"];
  if (!Array.isArray(value)) return ["/maryland/baltimore-apartments"];
  const paths = value.filter((v): v is string => typeof v === "string" && v.startsWith("/"));
  return paths.length > 0 ? paths : ["/maryland/baltimore-apartments"];
}

export const rentcomAdapter: SourceAdapter = {
  id: SOURCE_ID,
  name: "Rent.com",
  kind: "http",
  homepage: ORIGIN,
  defaultIntervalSec: 600,
  defaultEnabled: true,
  defaultConfig: { paths: ["/maryland/baltimore-apartments"] },

  async needsSetup(ctx) {
    return pathsFrom(ctx.config).length > 0
      ? null
      : "Add the rent.com city path for your campus, for example /maryland/baltimore-apartments.";
  },

  async search(ctx: SourceContext): Promise<RawListingInput[]> {
    const collected: RawListingInput[] = [];
    for (const path of pathsFrom(ctx.config)) {
      const suffix = ctx.hints.minBeds !== null ? `/${ctx.hints.minBeds}-bedroom` : "";
      const res = await ctx.http.fetch(`${ORIGIN}${path}${suffix}`, {
        browserHeaders: true,
        signal: ctx.signal,
      });
      const parsed = parseRentcomSearch(await res.text());
      ctx.log.debug("rentcom search", { path: `${path}${suffix}`, count: parsed.length });
      collected.push(...parsed);
    }
    return collected.filter((l) => inArea(ctx.area, l.lat ?? null, l.lon ?? null));
  },
};
