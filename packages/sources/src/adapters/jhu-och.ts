import type { RawListingInput } from "@housing/shared";
import { z } from "zod";
import { decode, found } from "../decode.ts";
import { haversineMiles } from "../geo.ts";
import {
  amenitiesFromLabels,
  bedCount,
  collapseWhitespace,
  isoDate,
  isoTimestamp,
  normalizePhone,
  parseMoney,
  plausibleSqft,
  positive,
  propertyTypeFrom,
  rangeTop,
} from "../text.ts";
import { SourceLayoutError, type SourceAdapter, type SourceContext } from "../types.ts";

const SOURCE_ID = "jhu-och";
const ORIGIN = "https://offcampushousing.jhu.edu";
const MAX_PAGES = 10;

/**
 * The site is an Angular app in front of a BFF. Its server-rendered HTML carries an Angular
 * transfer state, and the BFF answer for the first page is already inside it, so one page
 * load covers page one. Akamai rejects a request without the full desktop Chrome header set.
 */

/** Angular escapes the transfer state JSON with these five tokens. One pass, no rescanning. */
const TRANSFER_ESCAPES: Record<string, string> = {
  "&a;": "&",
  "&q;": '"',
  "&s;": "'",
  "&l;": "<",
  "&g;": ">",
};

export function unescapeTransferState(body: string): string {
  return body.replace(/&[aqslg];/g, (token) => TRANSFER_ESCAPES[token] ?? token);
}

const TransferEntrySchema = z.object({
  body: z.string(),
  url: z.string(),
  status: z.number().optional(),
});

function transferState(html: string): Record<string, unknown> {
  const match = found(
    /<script[^>]*id="ocp-state"[^>]*>([\s\S]*?)<\/script>/.exec(html),
    "jhu-och page",
    "ocp-state transfer script",
  );
  const raw: unknown = JSON.parse(found(match[1], "jhu-och page", "ocp-state body").trim());
  return decode(z.record(z.string(), z.unknown()), raw, "jhu-och transfer state");
}

function decodeKey(key: string): string {
  return Buffer.from(key, "base64").toString("utf8");
}

/**
 * Finds the transfer-state entry whose key decodes to a BFF URL matching the pattern, and
 * returns both the decoded BFF URL and the response body Angular already cached under it.
 */
export function readTransferEntry(
  html: string,
  pathFragment: RegExp,
): { url: string; body: unknown } {
  const state = transferState(html);
  for (const [key, value] of Object.entries(state)) {
    let decoded: string;
    try {
      decoded = decodeKey(key);
    } catch {
      continue;
    }
    if (!pathFragment.test(decoded)) continue;
    const entry = decode(TransferEntrySchema, value, "jhu-och transfer entry");
    return {
      url: Buffer.from(entry.url, "base64").toString("utf8"),
      body: JSON.parse(unescapeTransferState(entry.body)),
    };
  }
  throw new SourceLayoutError(
    `jhu-och page: no transfer-state entry matching ${pathFragment.source}`,
  );
}

export const SEARCH_BFF_PATTERN = /\/bff\/listing\/search\/combined\?/;
export const DETAIL_BFF_PATTERN = /\/bff\/listing\/[A-Za-z0-9]+\?/;

const PriceSchema = z.object({
  callForPrice: z.boolean().optional(),
  low: z.number().nullable().optional(),
  high: z.number().nullable().optional(),
});

const PlacardSchema = z.object({
  siteId: z.string(),
  ocpId: z.number().nullable().optional(),
  name: z.string(),
  profileUrl: z.string(),
  isSublet: z.boolean().optional(),
  isSharedSpace: z.boolean().optional(),
  lastUpdated: z.string().nullable().optional(),
  floorPlanSummary: z
    .object({
      hasPerBedPricing: z.boolean().nullable().optional(),
      matching: z
        .object({
          beds: z.object({ low: z.number().nullable(), high: z.number().nullable() }).partial().optional(),
          price: PriceSchema.optional(),
        })
        .optional(),
    })
    .loose()
    .optional(),
  geography: z.object({
    streetAddress: z.string().nullable().optional(),
    cityName: z.string().nullable().optional(),
    zipCode: z.string().nullable().optional(),
    latitude: z.number().nullable().optional(),
    longitude: z.number().nullable().optional(),
    neighborhoods: z.array(z.object({ name: z.string() }).loose()).optional(),
    targetCollege: z.object({ distance: z.number().nullable().optional() }).loose().nullable().optional(),
  }),
  leads: z
    .object({
      phone: z.object({ formatted: z.string().nullable().optional() }).loose().optional(),
    })
    .loose()
    .optional(),
  media: z
    .object({
      mainPhoto: z.object({ source: z.string() }).loose().nullable().optional(),
      images: z
        .union([
          z.object({ content: z.array(z.object({ source: z.string() }).loose()) }).loose(),
          z.array(z.object({ source: z.string() }).loose()),
        ])
        .nullable()
        .optional(),
    })
    .loose()
    .optional(),
});

const SearchBodySchema = z.object({
  data: z.object({
    placards: z.array(PlacardSchema),
    metadata: z
      .object({ totalResults: z.number().optional(), totalPages: z.number().optional() })
      .loose()
      .optional(),
  }),
});

type Placard = z.infer<typeof PlacardSchema>;

/** The site serves protocol-relative image URLs on independent-owner listings. */
function absoluteUrl(source: string): string {
  if (source.startsWith("//")) return `https:${source}`;
  if (source.startsWith("/")) return `${ORIGIN}${source}`;
  return source;
}

type MediaBlock = Placard["media"];

/** images is a bare array on independent-owner listings and { content: [...] } on managed ones. */
function mediaPhotos(media: MediaBlock): string[] {
  if (!media) return [];
  const images = media.images;
  const list = Array.isArray(images) ? images : (images?.content ?? []);
  const sources = list.map((image) => image.source);
  if (sources.length === 0 && media.mainPhoto) sources.push(media.mainPhoto.source);
  return [...new Set(sources)].map(absoluteUrl);
}

/**
 * Off Campus Partners states the rent basis on every listing. hasPerBedPricing true means the
 * price is per bedroom, which is how most student row homes near Homewood are advertised.
 */
function priceBasisFrom(hasPerBedPricing: boolean | null | undefined): "unit" | "room" | null {
  if (typeof hasPerBedPricing !== "boolean") return null;
  return hasPerBedPricing ? "room" : "unit";
}

export function placardToListing(placard: Placard): RawListingInput {
  const matching = placard.floorPlanSummary?.matching;
  const price = matching?.price;
  const url = `${ORIGIN}${placard.profileUrl}`;
  const neighborhood = placard.geography.neighborhoods?.[0]?.name ?? null;

  return {
    sourceId: SOURCE_ID,
    sourceListingId: placard.siteId,
    url,
    title: placard.name,
    price: price?.callForPrice ? null : positive(price?.low),
    priceMax: price?.callForPrice ? null : positive(price?.high),
    priceBasis: priceBasisFrom(placard.floorPlanSummary?.hasPerBedPricing),
    beds: bedCount(matching?.beds?.low),
    bedsMax: rangeTop(matching?.beds?.low, matching?.beds?.high),
    isSublet: placard.isSublet ?? false,
    propertyType: placard.isSharedSpace ? "room" : propertyTypeFrom(placard.name),
    address: placard.geography.streetAddress || null,
    neighborhood,
    zip: placard.geography.zipCode || null,
    lat: placard.geography.latitude ?? null,
    lon: placard.geography.longitude ?? null,
    photos: mediaPhotos(placard.media),
    contact: {
      phone: normalizePhone(placard.leads?.phone?.formatted),
      formUrl: url,
    },
    sourceUpdatedAt: isoTimestamp(placard.lastUpdated),
  };
}

export function parseJhuSearchBody(payload: unknown): {
  listings: RawListingInput[];
  totalPages: number;
} {
  const parsed = decode(SearchBodySchema, payload, "jhu-och search");
  return {
    listings: parsed.data.placards.map(placardToListing),
    totalPages: parsed.data.metadata?.totalPages ?? 1,
  };
}

const DetailBodySchema = z.object({
  data: z.object({
    siteId: z.string(),
    name: z.string(),
    longDescription: z.string().nullable().optional(),
    shortDescription: z.string().nullable().optional(),
    propertyType: z.string().nullable().optional(),
    propertyStyle: z.string().nullable().optional(),
    isSublet: z.boolean().optional(),
    isSharedSpace: z.boolean().optional(),
    lastUpdated: z.string().nullable().optional(),
    leads: z
      .object({ phone: z.object({ formatted: z.string().nullable().optional() }).loose().optional() })
      .loose()
      .optional(),
    pmcInfo: z
      .object({
        name: z.string().nullable().optional(),
        agent: z
          .object({ firstName: z.string().nullable().optional(), lastName: z.string().nullable().optional() })
          .loose()
          .nullable()
          .optional(),
      })
      .loose()
      .nullable()
      .optional(),
    mlsData: z.object({ agentEmail: z.string().nullable().optional() }).loose().nullable().optional(),
    geography: z
      .object({
        streetAddress: z.string().nullable().optional(),
        zipCode: z.string().nullable().optional(),
        latitude: z.number().nullable().optional(),
        longitude: z.number().nullable().optional(),
        neighborhoods: z.array(z.object({ name: z.string() }).loose()).optional(),
      })
      .loose(),
    incomeRestrictions: z.array(z.unknown()).nullable().optional(),
    floorPlanSummary: z
      .object({
        hasPerBedPricing: z.boolean().nullable().optional(),
        bathrooms: z.object({ low: z.number().nullable().optional() }).loose().optional(),
        bedrooms: z
          .object({
            low: z.number().nullable().optional(),
            high: z.number().nullable().optional(),
          })
          .loose()
          .optional(),
        squareFeet: z.object({ low: z.number().nullable().optional() }).loose().optional(),
        price: PriceSchema.optional(),
      })
      .loose()
      .optional(),
    floorPlans: z
      .array(
        z
          .object({
            beds: z.number().nullable().optional(),
            baths: z.number().nullable().optional(),
            squareFeet: z.string().nullable().optional(),
            priceLow: z.number().nullable().optional(),
            perBedPricing: z.boolean().nullable().optional(),
            availableDate: z.string().nullable().optional(),
            availability: z.string().nullable().optional(),
            availabilityDescription: z.string().nullable().optional(),
          })
          .loose(),
      )
      .optional(),
    amenityGroups: z
      .array(
        z
          .object({ items: z.array(z.object({ name: z.string() }).loose()).optional() })
          .loose(),
      )
      .optional(),
    media: z
      .object({
        mainPhoto: z.object({ source: z.string() }).loose().nullable().optional(),
        images: z
          .union([
            z.object({ content: z.array(z.object({ source: z.string() }).loose()) }).loose(),
            z.array(z.object({ source: z.string() }).loose()),
          ])
          .nullable()
          .optional(),
      })
      .loose()
      .optional(),
  }),
});

type FloorPlan = NonNullable<z.infer<typeof DetailBodySchema>["data"]["floorPlans"]>[number];

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "Available now" and "available immediately" state today, not a date. */
const AVAILABLE_NOW = /\bavailable\s+(?:now|immediately|today)\b/i;
/** The lead-in a landlord types before the date: "Available from 6/1/2027", "Available: 6/1/27". */
const AVAILABLE_LEAD =
  String.raw`\bavailable\b(?:\s+(?:on|from|starting|beginning|as\s+of))?\s*:?\s*`;
const AVAILABLE_NUMERIC = new RegExp(
  `${AVAILABLE_LEAD}(\\d{1,2})/(\\d{1,2})/(\\d{2}|\\d{4})\\b`,
  "i",
);
const AVAILABLE_MONTH = new RegExp(
  `${AVAILABLE_LEAD}(${MONTHS.join("|")})[a-z]*\\.?,?\\s+(?:(\\d{1,2})(?:st|nd|rd|th)?,?\\s+)?(\\d{4})\\b`,
  "i",
);

function ymd(year: number, month: number, day: number): string | null {
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Today in UTC, the same clock isoDate() reads every other date on the row with. */
function today(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Reads a date out of the wording a landlord typed. Only wording anchored on "available"
 * counts: a description carries other dates ("new flooring June 1st, 2026") and plenty of
 * other things that are available ("garage parking available"). A month with no day means
 * the first of that month, which is when a lease starts anyway.
 */
export function availableDateFromText(
  text: string | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!text) return null;
  const numeric = AVAILABLE_NUMERIC.exec(text);
  if (numeric) {
    const year = Number(numeric[3]);
    return ymd(year < 100 ? 2000 + year : year, Number(numeric[1]), Number(numeric[2]));
  }
  const month = AVAILABLE_MONTH.exec(text);
  if (month) {
    const index = MONTHS.indexOf((month[1] ?? "").slice(0, 3).toLowerCase());
    return ymd(Number(month[3]), index + 1, month[2] ? Number(month[2]) : 1);
  }
  return AVAILABLE_NOW.test(text) ? today(now) : null;
}

/**
 * Landlords who never pick a date come through with the Unix epoch, which the portal renders
 * as "Available Now", so a date that old is the site's placeholder and not a statement.
 */
const EARLIEST_REAL_DATE = "2000-01-01";

function planStatedDate(plan: FloorPlan | undefined): string | null {
  const iso = isoDate(plan?.availableDate);
  return iso !== null && iso >= EARLIEST_REAL_DATE ? iso : null;
}

function planSaysNow(plan: FloorPlan | undefined): boolean {
  if (!plan) return false;
  if (plan.availability === "AvailableNow") return true;
  return AVAILABLE_NOW.test(plan.availabilityDescription ?? "");
}

/**
 * The date the row states it comes free. The matching plan speaks for the row; when it states
 * nothing, the earliest dated plan speaks for the building, the convention price and beds
 * already follow. The description is the last resort, because only a listing a landlord wrote
 * by hand states the date in prose.
 */
function detailAvailableDate(
  plans: FloorPlan[],
  matchingPlan: FloorPlan | undefined,
  texts: Array<string | null | undefined>,
  now: Date,
): string | null {
  const matching = planStatedDate(matchingPlan);
  if (matching !== null) return matching;
  if (planSaysNow(matchingPlan)) return today(now);

  const dated = plans
    .map(planStatedDate)
    .filter((date): date is string => date !== null)
    .sort();
  if (dated[0]) return dated[0];
  if (plans.some(planSaysNow)) return today(now);

  for (const text of texts) {
    const fromText = availableDateFromText(text, now);
    if (fromText !== null) return fromText;
  }
  return null;
}

export function parseJhuDetailBody(
  payload: unknown,
  base: RawListingInput,
  now: Date = new Date(),
): RawListingInput {
  const { data } = decode(DetailBodySchema, payload, "jhu-och detail");
  const summary = data.floorPlanSummary;
  const plans = data.floorPlans ?? [];
  const matchingPlan = plans.find((plan) => plan.beds === base.beds) ?? plans[0];

  const amenityLabels = (data.amenityGroups ?? []).flatMap((group) =>
    (group.items ?? []).map((item) => item.name),
  );

  const agent = data.pmcInfo?.agent;
  const contactName = agent
    ? collapseWhitespace([agent.firstName ?? "", agent.lastName ?? ""].join(" ")) || null
    : null;

  const photos = mediaPhotos(data.media);
  const buildingRange = rangeTop(summary?.bedrooms?.low, summary?.bedrooms?.high);

  return {
    ...base,
    title: data.name,
    description: data.longDescription || data.shortDescription || null,
    // The detail body is the only place the whole building's floor plan range appears. When
    // it spans several plans, beds and price describe the smallest plan and bedsMax and
    // priceMax the largest. A placard only ever carries the plans that matched the search.
    price: buildingRange
      ? positive(summary?.price?.low)
      : (base.price ?? positive(summary?.price?.low) ?? positive(matchingPlan?.priceLow)),
    priceMax: buildingRange
      ? positive(summary?.price?.high)
      : (base.priceMax ?? positive(summary?.price?.high)),
    beds: buildingRange
      ? bedCount(summary?.bedrooms?.low)
      : (base.beds ?? positive(summary?.bedrooms?.low) ?? positive(matchingPlan?.beds)),
    bedsMax: buildingRange,
    priceBasis:
      priceBasisFrom(summary?.hasPerBedPricing) ??
      priceBasisFrom(matchingPlan?.perBedPricing) ??
      base.priceBasis ??
      null,
    incomeRestricted: data.incomeRestrictions ? data.incomeRestrictions.length > 0 : null,
    baths: positive(summary?.bathrooms?.low) ?? positive(matchingPlan?.baths),
    sqft:
      plausibleSqft(positive(summary?.squareFeet?.low)) ??
      plausibleSqft(parseMoney(matchingPlan?.squareFeet)),
    propertyType: propertyTypeFrom(data.propertyStyle, data.propertyType, data.name),
    isSublet: data.isSublet ?? base.isSublet ?? false,
    address: data.geography.streetAddress || base.address || null,
    neighborhood: data.geography.neighborhoods?.[0]?.name ?? base.neighborhood ?? null,
    zip: data.geography.zipCode || base.zip || null,
    lat: data.geography.latitude ?? base.lat ?? null,
    lon: data.geography.longitude ?? base.lon ?? null,
    availableDate: detailAvailableDate(
      plans,
      matchingPlan,
      [data.longDescription, data.shortDescription],
      now,
    ),
    amenities: amenitiesFromLabels(amenityLabels),
    photos: photos.length > 0 ? photos : (base.photos ?? []),
    contact: {
      name: contactName,
      company: data.pmcInfo?.name || null,
      email: data.mlsData?.agentEmail || null,
      phone: normalizePhone(data.leads?.phone?.formatted) ?? base.contact?.phone ?? null,
      formUrl: base.url,
    },
    sourceUpdatedAt: isoTimestamp(data.lastUpdated) ?? base.sourceUpdatedAt ?? null,
  };
}

/** The BFF pages through path segments, not a query parameter. */
export function bffUrlForPage(bffUrl: string, page: number): string {
  const url = new URL(bffUrl);
  const path = url.searchParams.get("url") ?? "/housing";
  url.searchParams.set("url", `${path.replace(/\/page-\d+$/, "")}/page-${page}`);
  return url.toString();
}

export const jhuOchAdapter: SourceAdapter = {
  id: SOURCE_ID,
  name: "JHU Off-Campus Housing",
  kind: "http",
  homepage: ORIGIN,
  defaultIntervalSec: 180,
  defaultEnabled: true,
  defaultConfig: { pathFilters: [] },

  needsSetup: async () => null,

  async search(ctx: SourceContext): Promise<RawListingInput[]> {
    const filters = Array.isArray(ctx.config["pathFilters"])
      ? ctx.config["pathFilters"].filter((f): f is string => typeof f === "string")
      : [];
    const segments = [...filters];
    if (ctx.hints.minBeds !== null) segments.push(`beds-${ctx.hints.minBeds}`);
    const path = segments.length > 0 ? `/housing/${segments.join("/")}` : "/housing";

    const pageRes = await ctx.http.fetch(`${ORIGIN}${path}`, {
      browserHeaders: true,
      signal: ctx.signal,
    });
    const entry = readTransferEntry(await pageRes.text(), SEARCH_BFF_PATTERN);
    const firstPage = parseJhuSearchBody(entry.body);

    const collected = [...firstPage.listings];
    const pages = Math.min(firstPage.totalPages, MAX_PAGES);
    for (let page = 2; page <= pages; page++) {
      const res = await ctx.http.fetch(bffUrlForPage(entry.url, page), {
        browserHeaders: true,
        headers: { Accept: "application/json, text/plain, */*", Referer: `${ORIGIN}${path}` },
        signal: ctx.signal,
      });
      collected.push(...parseJhuSearchBody(await res.json()).listings);
    }

    // An unscoped query returns rows 30 miles away, so distance from the campus anchor decides.
    const near = collected.filter((listing) => {
      if (listing.lat === null || listing.lat === undefined) return true;
      if (listing.lon === null || listing.lon === undefined) return true;
      return (
        haversineMiles(ctx.area.center, { lat: listing.lat, lon: listing.lon }) <=
        ctx.area.radiusMiles
      );
    });
    ctx.log.debug("jhu-och search", { pages, fetched: collected.length, near: near.length });
    return near;
  },

  async enrich(listing: RawListingInput, ctx: SourceContext): Promise<RawListingInput> {
    const res = await ctx.http.fetch(listing.url, { browserHeaders: true, signal: ctx.signal });
    const entry = readTransferEntry(await res.text(), DETAIL_BFF_PATTERN);
    return parseJhuDetailBody(entry.body, listing);
  },
};
