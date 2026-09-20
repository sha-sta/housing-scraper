import type { RawListingInput } from "@housing/shared";
import { z } from "zod";
import { decode } from "../decode.ts";
import { inArea } from "../geo.ts";
import { positive, propertyTypeFrom } from "../text.ts";
import { SourceLayoutError, type SourceAdapter, type SourceContext } from "../types.ts";

const SOURCE_ID = "apartmentlist";
const ORIGIN = "https://www.apartmentlist.com";

/**
 * Apartment List is a React server-component page. The card data sits in the streamed
 * self.__next_f payload, and the photo and price range sit in the ld+json Product list.
 *
 * Its search buckets rent by bedroom count 0, 1, 2 and 3, where 3 means three or more, so a
 * four-bedroom search cannot be expressed. One listing is emitted per bucket that carries a
 * price, and a bucket-3 row reports beds 3 even when the unit has more.
 */

const ListingSchema = z.object({
  rental_id: z.string(),
  lat: z.number().nullable().optional(),
  lon: z.number().nullable().optional(),
  display_name: z.string(),
  slug: z.string(),
  prices: z.record(z.string(), z.number().nullable()),
});

const ProductSchema = z.object({
  "@type": z.literal("Product"),
  name: z.string(),
  url: z.string(),
  image: z.object({ url: z.string() }).loose().optional(),
});

/** Concatenates the streamed RSC chunks back into one string. */
export function readRscPayload(html: string): string {
  const chunks = [...html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)];
  if (chunks.length === 0) {
    throw new SourceLayoutError("apartmentlist page: no self.__next_f payload");
  }
  // reason: the chunks are JSON string literals, so JSON.parse is the correct unescaper.
  return chunks.map((chunk) => JSON.parse(`"${chunk[1]}"`) as string).join("");
}

function bracketSlice(source: string, from: number): string {
  let depth = 0;
  let inString = false;
  for (let i = from; i < source.length; i++) {
    const char = source[i];
    if (inString) {
      if (char === "\\") i++;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "[") depth++;
    else if (char === "]") {
      depth--;
      if (depth === 0) return source.slice(from, i + 1);
    }
  }
  throw new SourceLayoutError("apartmentlist page: unterminated initialResults.listings array");
}

export function parseApartmentListPhotos(html: string): Map<string, string> {
  const photos = new Map<string, string>();
  for (const match of html.matchAll(
    /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g,
  )) {
    const body = match[1];
    if (!body) continue;
    const parsed: unknown = JSON.parse(body);
    if (!Array.isArray(parsed)) continue;
    for (const entry of parsed) {
      const product = ProductSchema.safeParse(entry);
      if (product.success && product.data.image) {
        photos.set(product.data.url, product.data.image.url);
      }
    }
  }
  return photos;
}

export function parseApartmentListSearch(html: string): RawListingInput[] {
  const payload = readRscPayload(html);
  const marker = payload.indexOf('"initialResults"');
  if (marker === -1) {
    throw new SourceLayoutError("apartmentlist page: initialResults missing from RSC payload");
  }
  const listingsKey = payload.indexOf('"listings":[', marker);
  if (listingsKey === -1) {
    throw new SourceLayoutError("apartmentlist page: initialResults.listings missing");
  }
  const raw: unknown = JSON.parse(bracketSlice(payload, payload.indexOf("[", listingsKey)));
  const listings = decode(z.array(ListingSchema.loose()), raw, "apartmentlist search");
  const photos = parseApartmentListPhotos(html);

  const out: RawListingInput[] = [];
  for (const listing of listings) {
    const url = `${ORIGIN}${listing.slug}`;
    const photo = photos.get(url);
    for (const [bucket, price] of Object.entries(listing.prices)) {
      const beds = Number(bucket);
      if (!Number.isInteger(beds) || positive(price) === null) continue;
      out.push({
        sourceId: SOURCE_ID,
        sourceListingId: `${listing.rental_id}#${bucket}`,
        url,
        title: `${listing.display_name} (${beds === 0 ? "studio" : `${beds} bed`})`,
        price: positive(price),
        beds: beds === 0 ? null : beds,
        propertyType: beds === 0 ? "studio" : propertyTypeFrom(listing.display_name),
        lat: listing.lat ?? null,
        lon: listing.lon ?? null,
        photos: photo ? [photo] : [],
        contact: { formUrl: url },
      });
    }
  }
  return out;
}

function pathsFrom(config: Record<string, unknown>): string[] {
  const value = config["paths"];
  if (!Array.isArray(value)) return ["/md/baltimore"];
  const paths = value.filter((v): v is string => typeof v === "string" && v.startsWith("/"));
  return paths.length > 0 ? paths : ["/md/baltimore"];
}

export const apartmentListAdapter: SourceAdapter = {
  id: SOURCE_ID,
  name: "Apartment List",
  kind: "http",
  homepage: ORIGIN,
  defaultIntervalSec: 600,
  // Off by default. Its search cannot express more than "3+ beds" and its rows carry no address or photos.
  defaultEnabled: false,
  defaultConfig: { paths: ["/md/baltimore"] },

  async needsSetup(ctx) {
    return pathsFrom(ctx.config).length > 0
      ? null
      : "Add the Apartment List city path for your campus, for example /md/baltimore.";
  },

  async search(ctx: SourceContext): Promise<RawListingInput[]> {
    const collected: RawListingInput[] = [];
    for (const path of pathsFrom(ctx.config)) {
      const res = await ctx.http.fetch(`${ORIGIN}${path}`, {
        browserHeaders: true,
        signal: ctx.signal,
      });
      const parsed = parseApartmentListSearch(await res.text());
      ctx.log.debug("apartmentlist search", { path, count: parsed.length });
      collected.push(...parsed);
    }
    return collected.filter((l) => inArea(ctx.area, l.lat ?? null, l.lon ?? null));
  },
};
