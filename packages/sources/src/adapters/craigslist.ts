import type { RawListingInput } from "@housing/shared";
import * as cheerio from "cheerio";
import { z } from "zod";
import { decode, found } from "../decode.ts";
import { inArea } from "../geo.ts";
import {
  amenitiesFromLabels,
  collapseWhitespace,
  isoTimestamp,
  parseBedBath,
  plausibleSqft,
  positive,
  propertyTypeFrom,
} from "../text.ts";
import {
  SourceLayoutError,
  type HttpClient,
  type SourceAdapter,
  type SourceContext,
} from "../types.ts";

const SOURCE_ID = "craigslist";
const SEARCH_HOST = "https://sapi.craigslist.org";
const AREAS_URL = "https://reference.craigslist.org/Areas";

/**
 * Craigslist forbids scraping in its terms of use, so this adapter makes exactly one search
 * request per run and fetches a detail page only for a posting the database has never seen.
 * robots.txt disallows /reply, so no reply URL is ever requested; contact.formUrl points at
 * the public listing page instead.
 */

const AreasSchema = z.array(z.object({ AreaID: z.number(), Hostname: z.string() }));

const SearchSchema = z.object({
  data: z.object({
    decode: z.object({
      minPostingId: z.number(),
      minPostedDate: z.number(),
      locationDescriptions: z.array(z.union([z.string(), z.number()])),
    }),
    items: z.array(z.array(z.unknown())),
    firstNearbyResultId: z.number().nullable().optional(),
    location: z.object({ url: z.string().optional() }).loose().optional(),
  }),
});

/** Craigslist packs optional fields into sub-arrays whose first element is a tag number. */
function taggedValue(item: readonly unknown[], tag: number): unknown[] | null {
  for (const element of item) {
    if (Array.isArray(element) && element[0] === tag) return element;
  }
  return null;
}

function coordinate(raw: string | undefined): number | null {
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value !== 0 ? value : null;
}

function lastString(item: readonly unknown[]): string | null {
  for (let i = item.length - 1; i >= 0; i--) {
    const element = item[i];
    if (typeof element === "string") return element;
  }
  return null;
}

export interface CraigslistDecoded {
  postingId: number;
  postedAt: string | null;
  price: number | null;
  lat: number | null;
  lon: number | null;
  neighborhood: string | null;
  slug: string | null;
  beds: number | null;
  sqft: number | null;
  title: string | null;
  photos: string[];
}

/**
 * Items are positional and delta encoded. Index 0 and 1 are offsets from decode.minPostingId
 * and decode.minPostedDate, index 3 is the price, index 4 is "accuracy:descIndex~lat~lon".
 * Everything else arrives as tagged sub-arrays, and their positions move between postings.
 */
export function decodeCraigslistItem(
  item: readonly unknown[],
  base: { minPostingId: number; minPostedDate: number; locationDescriptions: Array<string | number> },
): CraigslistDecoded {
  const idDelta = item[0];
  const dateDelta = item[1];
  if (typeof idDelta !== "number" || typeof dateDelta !== "number") {
    throw new SourceLayoutError("craigslist search: items[].0 expected a number delta");
  }

  const locationField = typeof item[4] === "string" ? item[4] : "";
  const [, positionPart = ""] = locationField.split(":");
  const [descIndexRaw, latRaw, lonRaw] = positionPart.split("~");
  const descIndex = Number(descIndexRaw);
  const description = Number.isInteger(descIndex)
    ? base.locationDescriptions[descIndex]
    : undefined;

  const housing = taggedValue(item, 5);
  const slugPair = taggedValue(item, 6);
  const images = taggedValue(item, 4);

  return {
    postingId: base.minPostingId + idDelta,
    postedAt: isoTimestamp(base.minPostedDate + dateDelta),
    price: positive(item[3]),
    lat: coordinate(latRaw),
    lon: coordinate(lonRaw),
    neighborhood: typeof description === "string" ? description : null,
    slug: typeof slugPair?.[1] === "string" ? slugPair[1] : null,
    beds: housing ? positive(housing[1]) : null,
    sqft: plausibleSqft(housing ? positive(housing[2]) : null),
    title: lastString(item),
    photos: (images ?? [])
      .slice(1)
      .filter((token): token is string => typeof token === "string")
      // Tokens arrive as "3:00J0J_ckJgd3NzlUZ_0t20CI"; the size suffix is ours to choose.
      .map((token) => `https://images.craigslist.org/${token.split(":").pop()}_600x450.jpg`),
  };
}

export function parseCraigslistSearch(
  payload: unknown,
  options: { site: string },
): RawListingInput[] {
  const parsed = decode(SearchSchema, payload, "craigslist search");
  const { decode: base, items } = parsed.data;
  const host = parsed.data.location?.url ?? `${options.site}.craigslist.org`;

  // Everything from firstNearbyResultId on sits outside the searched radius.
  const cutoff = parsed.data.firstNearbyResultId ?? null;
  const inRadius: RawListingInput[] = [];

  for (const item of items) {
    const row = decodeCraigslistItem(item, base);
    if (cutoff !== null && row.postingId === cutoff) break;
    if (!row.slug || !row.title) continue;

    const url = `https://${host}/apa/d/${row.slug}/${row.postingId}.html`;
    inRadius.push({
      sourceId: SOURCE_ID,
      sourceListingId: String(row.postingId),
      url,
      title: row.title,
      price: row.price,
      beds: row.beds,
      sqft: row.sqft,
      lat: row.lat,
      lon: row.lon,
      neighborhood: row.neighborhood,
      propertyType: propertyTypeFrom(row.title),
      photos: row.photos,
      postedAt: row.postedAt,
      contact: { formUrl: url },
    });
  }

  if (items.length > 0 && inRadius.length === 0 && cutoff === null) {
    throw new SourceLayoutError("craigslist search: items decoded to nothing usable");
  }
  return inRadius;
}

const DETAIL_LD_SCHEMA = z
  .object({
    numberOfBedrooms: z.union([z.string(), z.number()]).nullish(),
    numberOfBathroomsTotal: z.union([z.string(), z.number()]).nullish(),
    latitude: z.union([z.string(), z.number()]).nullish(),
    longitude: z.union([z.string(), z.number()]).nullish(),
    address: z
      .object({
        streetAddress: z.string().nullish(),
        addressLocality: z.string().nullish(),
        postalCode: z.string().nullish(),
      })
      .loose()
      .nullish(),
  })
  .loose();

function numberFrom(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return positive(typeof value === "string" ? Number(value) : value);
}

export function parseCraigslistDetail(html: string, base: RawListingInput): RawListingInput {
  const $ = cheerio.load(html);

  const body = $("#postingbody").clone();
  body.find(".print-information").remove();
  const description = collapseWhitespace(body.text()) || null;

  const attrLabels: string[] = [];
  $("[class^='attr '], [class*=' attr ']").each((_, el) => {
    attrLabels.push(collapseWhitespace($(el).text()));
  });
  const important = attrLabels.join(" ");
  const { beds, baths, sqft } = parseBedBath(important);

  // The page carries a BreadcrumbList and a House or Apartment block; only the latter has coordinates.
  const blocks = $("script[type='application/ld+json']")
    .toArray()
    .map((el): unknown => JSON.parse($(el).text().trim()))
    .map((candidate) => DETAIL_LD_SCHEMA.safeParse(candidate))
    .flatMap((result) => (result.success ? [result.data] : []));
  const meta = blocks.find((block) => block.latitude != null || block.numberOfBedrooms != null) ?? null;

  const availableMatch = important.match(/available\s+(now|[a-z]{3}\s+\d{1,2}|\d{1,2}\/\d{1,2})/i);
  const availableDate =
    availableMatch && /now/i.test(availableMatch[1] ?? "")
      ? new Date().toISOString().slice(0, 10)
      : null;

  const street = meta?.address?.streetAddress ?? null;
  const mapAddress = collapseWhitespace($(".mapaddress").first().text()) || null;

  return {
    ...base,
    description,
    beds: beds ?? numberFrom(meta?.numberOfBedrooms) ?? base.beds ?? null,
    baths: baths ?? numberFrom(meta?.numberOfBathroomsTotal) ?? null,
    sqft: sqft ?? base.sqft ?? null,
    address: street ?? mapAddress,
    zip: meta?.address?.postalCode ?? null,
    lat: numberFrom(meta?.latitude) ?? base.lat ?? null,
    lon: meta?.longitude !== undefined && meta.longitude !== null
      ? Number(meta.longitude)
      : (base.lon ?? null),
    availableDate,
    amenities: amenitiesFromLabels(attrLabels),
    propertyType: propertyTypeFrom(important, base.title),
    photos:
      base.photos && base.photos.length > 0
        ? base.photos
        : [...new Set($("img[src*='images.craigslist.org']").map((_, el) => $(el).attr("src") ?? "").toArray())].filter(Boolean),
  };
}

/** Hostname -> craigslist AreaID, the number the search API wants as the batch prefix. */
const areaIdCache = new Map<string, number>();

export async function resolveAreaId(http: HttpClient, site: string): Promise<number> {
  const cached = areaIdCache.get(site);
  if (cached !== undefined) return cached;
  const res = await http.fetch(AREAS_URL, { timeoutMs: 20000 });
  const areas = decode(AreasSchema, await res.json(), "craigslist areas");
  const match = found(
    areas.find((a) => a.Hostname === site),
    "craigslist areas",
    `hostname ${site}`,
  );
  areaIdCache.set(site, match.AreaID);
  return match.AreaID;
}

function configString(config: Record<string, unknown>, key: string, fallback: string): string {
  const value = config[key];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

export const craigslistAdapter: SourceAdapter = {
  id: SOURCE_ID,
  name: "Craigslist",
  kind: "http",
  homepage: "https://www.craigslist.org",
  defaultIntervalSec: 120,
  defaultEnabled: true,
  defaultConfig: { site: "baltimore", category: "apa" },

  needsSetup: async () => null,

  async search(ctx: SourceContext): Promise<RawListingInput[]> {
    const site = configString(ctx.config, "site", "baltimore");
    const category = configString(ctx.config, "category", "apa");
    const areaIdFromConfig = ctx.config["areaId"];
    const areaId =
      typeof areaIdFromConfig === "number"
        ? areaIdFromConfig
        : await resolveAreaId(ctx.http, site);

    const params = new URLSearchParams({
      batch: `${areaId}-0-360-0-0`,
      cc: "US",
      lang: "en",
      lat: String(ctx.area.center.lat),
      lon: String(ctx.area.center.lon),
      search_distance: String(ctx.area.radiusMiles),
      searchPath: category,
      sort: "date",
    });
    if (ctx.hints.minBeds !== null) params.set("min_bedrooms", String(ctx.hints.minBeds));
    if (ctx.hints.maxPrice !== null) params.set("max_price", String(ctx.hints.maxPrice));

    const res = await ctx.http.fetch(
      `${SEARCH_HOST}/web/v8/postings/search/full?${params.toString()}`,
      { signal: ctx.signal },
    );
    const listings = parseCraigslistSearch(await res.json(), { site });
    ctx.log.debug("craigslist search", { areaId, count: listings.length });
    return listings.filter((l) => inArea(ctx.area, l.lat ?? null, l.lon ?? null));
  },

  async enrich(listing: RawListingInput, ctx: SourceContext): Promise<RawListingInput> {
    const res = await ctx.http.fetch(listing.url, {
      browserHeaders: true,
      signal: ctx.signal,
    });
    return parseCraigslistDetail(await res.text(), listing);
  },
};
