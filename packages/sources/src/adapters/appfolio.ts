import type { RawListingInput } from "@housing/shared";
import * as cheerio from "cheerio";
import { z } from "zod";
import { decode } from "../decode.ts";
import { inArea } from "../geo.ts";
import {
  amenitiesFromLabels,
  collapseWhitespace,
  isoDate,
  parseBedBath,
  parseMoney,
  plausibleSqft,
  propertyTypeFrom,
} from "../text.ts";
import { SourceLayoutError, type SourceAdapter, type SourceContext } from "../types.ts";

const SOURCE_ID = "appfolio";

/**
 * One adapter for every landlord on AppFolio, driven by ctx.config.subdomains. The
 * listings.json endpoint answers 401 without a session, so the public HTML is the source.
 * Coordinates come from the Google Map bootstrap at the bottom of the same page.
 */

const MarkerSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  address: z.string().nullable().optional(),
  default_photo_url: z.string().nullable().optional(),
  detail_page_url: z.string(),
  listing_id: z.number().nullable().optional(),
});

type Marker = z.infer<typeof MarkerSchema>;

/** Reads the markers array out of `new GoogleMap({ ..., markers: [...] })`. */
export function parseAppfolioMarkers(html: string): Map<string, Marker> {
  const start = html.indexOf("markers:");
  const map = new Map<string, Marker>();
  if (start === -1) return map;
  const open = html.indexOf("[", start);
  if (open === -1) return map;

  let depth = 0;
  let inString = false;
  let end = open;
  for (; end < html.length; end++) {
    const char = html[end];
    if (inString) {
      if (char === "\\") end++;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "[") depth++;
    else if (char === "]") {
      depth--;
      if (depth === 0) break;
    }
  }

  const raw: unknown = JSON.parse(html.slice(open, end + 1));
  const markers = decode(z.array(MarkerSchema.loose()), raw, "appfolio markers");
  for (const marker of markers) map.set(marker.detail_page_url, marker);
  return map;
}

export function parseAppfolioListings(html: string, subdomain: string): RawListingInput[] {
  const $ = cheerio.load(html);
  const markers = parseAppfolioMarkers(html);
  const origin = `https://${subdomain}.appfolio.com`;
  const listings: RawListingInput[] = [];

  $(".js-listing-item").each((_, el) => {
    const item = $(el);
    const titleLink = item.find(".js-listing-title a").first();
    const path = titleLink.attr("href") ?? item.find(".js-link-to-detail").first().attr("href");
    if (!path) return;

    const uid = path.split("/").pop() ?? path;
    // The quick-facts list is a <dl> of RENT, Square Feet, Bed / Bath and Available.
    const facts: Record<string, string> = {};
    item.find(".detail-box__item").each((_unused, factEl) => {
      const label = collapseWhitespace($(factEl).find(".detail-box__label").text()).toLowerCase();
      if (label) facts[label] = collapseWhitespace($(factEl).find(".detail-box__value").text());
    });
    const bedBath = parseBedBath(facts["bed / bath"] ?? "");
    const marker = markers.get(path);
    const petPolicy = collapseWhitespace(item.find(".js-listing-pet-policy").text());
    const amenityText = collapseWhitespace(
      item.find("p").filter((_, p) => $(p).text().includes("Amenities:")).text(),
    );
    const description = collapseWhitespace(item.find(".js-listing-description").text()) || null;
    const available = collapseWhitespace(facts["available"] ?? "");

    listings.push({
      sourceId: SOURCE_ID,
      sourceListingId: `${subdomain}:${uid}`,
      url: `${origin}${path}`,
      title: collapseWhitespace(titleLink.text()) || `${subdomain} listing`,
      description,
      price: parseMoney(facts["rent"]),
      beds: bedBath.beds,
      baths: bedBath.baths,
      sqft: plausibleSqft(parseMoney(facts["square feet"])),
      propertyType: propertyTypeFrom(titleLink.text(), description),
      address: collapseWhitespace(item.find(".js-listing-address").text()) || marker?.address || null,
      lat: marker?.latitude ?? null,
      lon: marker?.longitude ?? null,
      availableDate: /^now$/i.test(available) ? new Date().toISOString().slice(0, 10) : isoDate(available),
      photos: [marker?.default_photo_url, item.find(".js-listing-image").attr("data-original")]
        .filter((src): src is string => typeof src === "string" && src.startsWith("http")),
      amenities: amenitiesFromLabels([amenityText, petPolicy, description ?? ""]),
      contact: { company: subdomain, formUrl: `${origin}${path}` },
    });
  });

  if (listings.length === 0 && html.includes("js-listing-item")) {
    throw new SourceLayoutError("appfolio listings: found listing blocks but parsed none");
  }
  return listings;
}

function subdomainsFrom(config: Record<string, unknown>): string[] {
  const value = config["subdomains"];
  if (!Array.isArray(value)) return ["americanmanagement"];
  const names = value.filter((v): v is string => typeof v === "string" && v.length > 0);
  return names.length > 0 ? names : ["americanmanagement"];
}

export const appfolioAdapter: SourceAdapter = {
  id: SOURCE_ID,
  name: "AppFolio landlords",
  kind: "http",
  homepage: "https://www.appfolio.com",
  defaultIntervalSec: 300,
  defaultEnabled: true,
  defaultConfig: { subdomains: ["americanmanagement"] },

  async needsSetup(ctx) {
    return subdomainsFrom(ctx.config).length > 0
      ? null
      : "Add at least one AppFolio subdomain, for example americanmanagement from americanmanagement.appfolio.com.";
  },

  async search(ctx: SourceContext): Promise<RawListingInput[]> {
    const collected: RawListingInput[] = [];
    for (const subdomain of subdomainsFrom(ctx.config)) {
      const res = await ctx.http.fetch(`https://${subdomain}.appfolio.com/listings`, {
        browserHeaders: true,
        signal: ctx.signal,
      });
      const parsed = parseAppfolioListings(await res.text(), subdomain);
      ctx.log.debug("appfolio search", { subdomain, count: parsed.length });
      collected.push(...parsed);
    }
    return collected.filter((l) => inArea(ctx.area, l.lat ?? null, l.lon ?? null));
  },
};
