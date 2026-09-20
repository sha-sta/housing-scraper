import type { RawListingInput } from "@housing/shared";
import * as cheerio from "cheerio";
import { collapseWhitespace, parseBedBath, parseMoney, propertyTypeFrom } from "../text.ts";
import { inArea } from "../geo.ts";
import type { BrowserPage, SourceAdapter, SourceContext } from "../types.ts";

const SOURCE_ID = "facebook-marketplace";
const ORIGIN = "https://www.facebook.com";
const MAX_ENRICH_PER_RUN = 5;

/**
 * WARNING. Automated access to Facebook can get an account restricted or disabled. Turning
 * this source on means accepting that risk for the account logged into the persistent
 * browser profile named "facebook". The adapter is off by default for that reason.
 *
 * It drives the user's own logged-in profile and never handles a password or a cookie: the
 * login happens in a headed window the user drives, through `pnpm --filter @housing/sources
 * fb:login`. One search page load per run and at most five item loads per run.
 */

export const FACEBOOK_PROFILE = "facebook";

export interface MarketplaceCard {
  itemId: string;
  title: string;
  price: number | null;
  location: string | null;
  photo: string | null;
}

/**
 * Cards are parsed from the item anchor rather than from class names, which Facebook
 * regenerates on every deploy. Within an anchor the visible spans arrive as an optional
 * badge, then the price, then the title, then the location.
 */
export function parseMarketplaceCards(html: string): MarketplaceCard[] {
  const $ = cheerio.load(html);
  const byId = new Map<string, MarketplaceCard>();

  $('a[href*="/marketplace/item/"]').each((_, el) => {
    const anchor = $(el);
    const href = anchor.attr("href") ?? "";
    const idMatch = /\/marketplace\/item\/(\d+)/.exec(href);
    if (!idMatch?.[1] || byId.has(idMatch[1])) return;

    const spans = [
      ...new Set(
        anchor
          .find("span")
          .toArray()
          .map((span) => collapseWhitespace($(span).text()))
          .filter((text) => text.length > 0),
      ),
    ];
    const priceIndex = spans.findIndex((text) => /^\$[\d,]/.test(text) || /^free$/i.test(text));
    const rest = spans.filter((_text, index) => index !== priceIndex);
    if (rest.length < 2) return;

    const photo = anchor.find("img").first().attr("src") ?? null;
    byId.set(idMatch[1], {
      itemId: idMatch[1],
      title: rest[rest.length - 2] ?? "",
      price: priceIndex === -1 ? null : parseMoney(spans[priceIndex]),
      location: rest[rest.length - 1] ?? null,
      photo: photo && photo.startsWith("http") ? photo : null,
    });
  });

  return [...byId.values()].filter((card) => card.title.length > 0);
}

/** Relay ships precise coordinates for a subset of the cards; the DOM carries none. */
export function parseMarketplaceCoordinates(html: string): Map<string, { lat: number; lon: number }> {
  const out = new Map<string, { lat: number; lon: number }>();
  const pattern =
    /"id":"(\d+)","location":\{"latitude":(-?\d+(?:\.\d+)?),"longitude":(-?\d+(?:\.\d+)?)\}/g;
  for (const match of html.matchAll(pattern)) {
    const [, id, lat, lon] = match;
    if (id && lat && lon) out.set(id, { lat: Number(lat), lon: Number(lon) });
  }
  return out;
}

export function cardsToListings(html: string): RawListingInput[] {
  const coordinates = parseMarketplaceCoordinates(html);
  return parseMarketplaceCards(html).map((card) => {
    const url = `${ORIGIN}/marketplace/item/${card.itemId}/`;
    const point = coordinates.get(card.itemId);
    const { beds, baths, sqft } = parseBedBath(card.title);
    return {
      sourceId: SOURCE_ID,
      sourceListingId: card.itemId,
      url,
      title: card.title,
      price: card.price,
      beds,
      baths,
      sqft,
      propertyType: propertyTypeFrom(card.title),
      address: card.location,
      lat: point?.lat ?? null,
      lon: point?.lon ?? null,
      photos: card.photo ? [card.photo] : [],
      contact: { formUrl: url },
    } satisfies RawListingInput;
  });
}

/**
 * The item page exposes the full text and the unredacted street address through Open Graph
 * tags, which the Relay payload redacts, so those are what enrich reads.
 */
export function parseMarketplaceItem(html: string, base: RawListingInput): RawListingInput {
  const $ = cheerio.load(html);
  const title = $('meta[property="og:title"]').attr("content") ?? base.title;
  const description = $('meta[property="og:description"]').attr("content") ?? null;
  const image = $('meta[property="og:image"]').attr("content") ?? null;

  const lines = (description ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
  // Line one repeats the title and line two is the address when the seller supplied one.
  const addressLine = lines.length > 1 ? (lines[1] ?? null) : null;
  const detail = parseBedBath(`${title} ${description ?? ""}`);

  return {
    ...base,
    title,
    description,
    beds: base.beds ?? detail.beds,
    baths: base.baths ?? detail.baths,
    sqft: base.sqft ?? detail.sqft,
    address: addressLine && /\d/.test(addressLine) ? addressLine : base.address,
    photos: image ? [...new Set([image, ...(base.photos ?? [])])] : (base.photos ?? []),
    propertyType: propertyTypeFrom(title, description),
  };
}

export function marketplaceSearchUrl(
  center: { lat: number; lon: number },
  radiusMiles: number,
  minBeds: number | null,
): string {
  const params = new URLSearchParams({
    latitude: String(center.lat),
    longitude: String(center.lon),
    radius: String(Math.max(1, Math.round(radiusMiles))),
    sortBy: "creation_time_descend",
    exact: "false",
  });
  if (minBeds !== null && minBeds > 0) params.set("minBedrooms", String(minBeds));
  return `${ORIGIN}/marketplace/category/propertyrentals?${params.toString()}`;
}

/** A logged-out session lands on a login wall or serves a login dialog over the feed. */
export async function isLoggedIn(page: BrowserPage): Promise<boolean> {
  const current = page.url?.() ?? "";
  if (current.includes("/login")) return false;
  const html = await page.content();
  return !/<form[^>]+action="[^"]*\/login\//i.test(html);
}

/** One run opens the search page once and at most MAX_ENRICH_PER_RUN item pages. */
let detailLoadsThisRun = 0;

export const facebookMarketplaceAdapter: SourceAdapter = {
  id: SOURCE_ID,
  name: "Facebook Marketplace",
  kind: "account",
  homepage: `${ORIGIN}/marketplace`,
  defaultIntervalSec: 900,
  defaultEnabled: false,
  peerPosted: true,
  defaultConfig: {},

  async needsSetup(ctx) {
    const page = await ctx.browser.newPage({ profileName: FACEBOOK_PROFILE });
    try {
      await page.goto(`${ORIGIN}/marketplace`);
      return (await isLoggedIn(page))
        ? null
        : "Not signed in to Facebook. Run `pnpm --filter @housing/sources fb:login`, sign in in the window that opens, then close it.";
    } finally {
      await page.close();
    }
  },

  async search(ctx: SourceContext): Promise<RawListingInput[]> {
    detailLoadsThisRun = 0;
    const url = marketplaceSearchUrl(ctx.area.center, ctx.area.radiusMiles, ctx.hints.minBeds);
    const page = await ctx.browser.newPage({ profileName: FACEBOOK_PROFILE });
    try {
      await page.goto(url);
      await page.waitForSelector('a[href*="/marketplace/item/"]');
      await page.scrollToBottom();
      await page.waitForTimeout?.(3000);
      const listings = cardsToListings(await page.content());
      ctx.log.debug("facebook marketplace search", { count: listings.length });
      return listings.filter((l) => inArea(ctx.area, l.lat ?? null, l.lon ?? null));
    } finally {
      await page.close();
    }
  },

  async enrich(listing: RawListingInput, ctx: SourceContext): Promise<RawListingInput> {
    if (detailLoadsThisRun >= MAX_ENRICH_PER_RUN) {
      ctx.log.debug("facebook marketplace enrich skipped, budget spent", { url: listing.url });
      return listing;
    }
    detailLoadsThisRun++;
    const page = await ctx.browser.newPage({ profileName: FACEBOOK_PROFILE });
    try {
      await page.goto(listing.url);
      await page.waitForSelector('meta[property="og:title"]', 10000);
      return parseMarketplaceItem(await page.content(), listing);
    } finally {
      await page.close();
    }
  },
};
