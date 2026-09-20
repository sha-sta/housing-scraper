import type { RawListingInput } from "@housing/shared";
import { z } from "zod";
import { decode } from "../decode.ts";
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
import { SourceLayoutError, type SourceAdapter, type SourceContext } from "../types.ts";

const SOURCE_ID = "zumper";
const ORIGIN = "https://www.zumper.com";

/**
 * Zumper and PadMapper share inventory and sit behind a Fastly JavaScript challenge, so the
 * page is loaded in the ordinary browser pool rather than over plain HTTP. No challenge
 * solving and no fingerprint spoofing: a normal headless Chromium passes on its own.
 *
 * The rendered HTML carries window.__PRELOADED_STATE__, and the box query parameter narrows
 * the search to ctx.area.bbox, so the city slug in the path only picks the metro.
 */

const ListableSchema = z.object({
  listing_id: z.number(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  zipcode: z.string().nullable().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  title: z.string().nullable().optional(),
  building_name: z.string().nullable().optional(),
  short_description: z.string().nullable().optional(),
  neighborhood_name: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  min_price: z.number().nullable().optional(),
  max_price: z.number().nullable().optional(),
  min_bedrooms: z.number().nullable().optional(),
  max_bedrooms: z.number().nullable().optional(),
  min_bathrooms: z.number().nullable().optional(),
  min_square_feet: z.number().nullable().optional(),
  date_available: z.union([z.string(), z.number()]).nullable().optional(),
  listed_on: z.number().nullable().optional(),
  modified_on: z.number().nullable().optional(),
  phone: z.string().nullable().optional(),
  agent_name: z.string().nullable().optional(),
  brokerage_name: z.string().nullable().optional(),
  image_ids: z.array(z.number()).nullable().optional(),
  amenity_tags: z.array(z.string()).nullable().optional(),
  building_amenity_tags: z.array(z.string()).nullable().optional(),
  property_type: z.number().nullable().optional(),
});

const StateSchema = z.object({
  currentSearch: z.object({
    listables: z.object({
      listables: z.array(ListableSchema.loose()),
      listingCount: z.number().optional(),
    }),
  }),
});

/** Slices window.__PRELOADED_STATE__ = {...} out of the rendered page. */
export function extractPreloadedState(html: string): unknown {
  const marker = "window.__PRELOADED_STATE__ = ";
  const at = html.indexOf(marker);
  if (at === -1) {
    throw new SourceLayoutError("zumper page: window.__PRELOADED_STATE__ not found");
  }
  const from = html.indexOf("{", at + marker.length);
  let depth = 0;
  let inString = false;
  for (let i = from; i < html.length; i++) {
    const char = html[i];
    if (inString) {
      if (char === "\\") i++;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) return JSON.parse(html.slice(from, i + 1));
    }
  }
  throw new SourceLayoutError("zumper page: unterminated __PRELOADED_STATE__ object");
}

export function parseZumperSearch(html: string): RawListingInput[] {
  const state = decode(StateSchema, extractPreloadedState(html), "zumper search");

  return state.currentSearch.listables.listables.map((row) => {
    const path = row.url ?? `/listing/${row.listing_id}`;
    const url = `${ORIGIN}${path}`;
    const title = row.title || row.building_name || row.address || `Zumper listing ${row.listing_id}`;

    return {
      sourceId: SOURCE_ID,
      sourceListingId: String(row.listing_id),
      url,
      title,
      description: row.short_description || null,
      price: positive(row.min_price),
      priceMax: positive(row.max_price),
      beds: bedCount(row.min_bedrooms),
      bedsMax: rangeTop(row.min_bedrooms, row.max_bedrooms),
      baths: positive(row.min_bathrooms),
      // Zumper writes Long.MAX_VALUE into min_square_feet when the number is unknown.
      sqft: plausibleSqft(positive(row.min_square_feet)),
      propertyType: propertyTypeFrom(title, row.short_description),
      address: row.address || null,
      neighborhood: row.neighborhood_name || null,
      zip: row.zipcode || null,
      lat: row.lat ?? null,
      lon: row.lng ?? null,
      availableDate: typeof row.date_available === "string" ? isoDate(row.date_available) : null,
      photos: (row.image_ids ?? []).slice(0, 8).map((id) => `https://img.zumpercdn.com/${id}/1280x960`),
      amenities: amenitiesFromLabels([
        ...(row.amenity_tags ?? []),
        ...(row.building_amenity_tags ?? []),
      ]),
      contact: {
        name: row.agent_name || null,
        company: row.brokerage_name || null,
        phone: normalizePhone(row.phone),
        formUrl: url,
      },
      postedAt: isoTimestamp(row.listed_on),
      sourceUpdatedAt: isoTimestamp(row.modified_on),
    } satisfies RawListingInput;
  });
}

function citySlug(config: Record<string, unknown>): string {
  const value = config["citySlug"];
  return typeof value === "string" && value.length > 0 ? value : "baltimore-md";
}

export function zumperSearchUrl(
  slug: string,
  bbox: { minLat: number; minLon: number; maxLat: number; maxLon: number },
  minBeds: number | null,
): string {
  const beds = minBeds !== null && minBeds > 0 ? `/${minBeds}+beds` : "";
  const box = `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`;
  return `${ORIGIN}/apartments-for-rent/${slug}${beds}?box=${box}`;
}

export const zumperAdapter: SourceAdapter = {
  id: SOURCE_ID,
  name: "Zumper",
  kind: "browser",
  homepage: ORIGIN,
  defaultIntervalSec: 600,
  defaultEnabled: true,
  defaultConfig: { citySlug: "baltimore-md" },

  needsSetup: async () => null,

  async search(ctx: SourceContext): Promise<RawListingInput[]> {
    const url = zumperSearchUrl(citySlug(ctx.config), ctx.area.bbox, ctx.hints.minBeds);
    const page = await ctx.browser.newPage();
    try {
      await page.goto(url);
      // The state is server rendered, so waiting for the script node is enough.
      await page.waitForSelector("script:not([src])");
      const listings = parseZumperSearch(await page.content());
      ctx.log.debug("zumper search", { url, count: listings.length });
      return listings.filter((l) => inArea(ctx.area, l.lat ?? null, l.lon ?? null));
    } finally {
      await page.close();
    }
  },
};
