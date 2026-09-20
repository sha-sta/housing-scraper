import { CAMPUSES, RawListingSchema, type RawListingInput } from "@housing/shared";
import { adapters } from "./adapters/index.ts";
import { createBrowserPool } from "./browser.ts";
import { createHttpClient } from "./http.ts";
import type { Logger, SearchArea, SourceContext } from "./types.ts";

/**
 * Runs one real search for the Homewood preset and prints how complete the results are.
 * Forkers use it to tell a broken adapter from a site that simply has nothing today.
 *
 *   pnpm --filter @housing/sources smoke <adapterId>
 */

const MILES_PER_DEGREE_LAT = 69;
const ENRICH_LIMIT = 3;

const verbose = process.argv.includes("--verbose");

const log: Logger = {
  debug: (msg, data) => {
    if (verbose) process.stdout.write(`  debug ${msg} ${data ? JSON.stringify(data) : ""}\n`);
  },
  info: (msg, data) => process.stdout.write(`  info ${msg} ${data ? JSON.stringify(data) : ""}\n`),
  warn: (msg, data) => process.stdout.write(`  warn ${msg} ${data ? JSON.stringify(data) : ""}\n`),
  error: (msg, data) => process.stderr.write(`  error ${msg} ${data ? JSON.stringify(data) : ""}\n`),
};

function homewoodArea(): SearchArea {
  const campus = CAMPUSES.find((c) => c.id === "homewood");
  if (!campus) throw new Error("homewood campus preset is missing from @housing/shared");
  const { lat, lon } = campus.anchor;
  const dLat = campus.searchRadiusMiles / MILES_PER_DEGREE_LAT;
  const dLon = campus.searchRadiusMiles / (MILES_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180));
  return {
    center: { lat, lon },
    radiusMiles: campus.searchRadiusMiles,
    bbox: { minLat: lat - dLat, maxLat: lat + dLat, minLon: lon - dLon, maxLon: lon + dLon },
    zips: campus.zips,
    neighborhoods: campus.neighborhoods,
  };
}

interface Column {
  label: string;
  has: (listing: RawListingInput) => boolean;
}

const COLUMNS: Column[] = [
  { label: "price", has: (l) => typeof l.price === "number" },
  { label: "beds", has: (l) => typeof l.beds === "number" },
  { label: "bedsMax", has: (l) => typeof l.bedsMax === "number" },
  { label: "address", has: (l) => typeof l.address === "string" && l.address.length > 0 },
  { label: "lat/lon", has: (l) => typeof l.lat === "number" && typeof l.lon === "number" },
  { label: "photos", has: (l) => Array.isArray(l.photos) && l.photos.length > 0 },
  { label: "available", has: (l) => typeof l.availableDate === "string" },
  { label: "phone", has: (l) => typeof l.contact?.phone === "string" && l.contact.phone.length > 0 },
  { label: "email", has: (l) => typeof l.contact?.email === "string" && l.contact.email.length > 0 },
];

function table(listings: RawListingInput[]): string {
  const cells = COLUMNS.map((column) => {
    const hits = listings.filter((l) => column.has(l)).length;
    const pct = listings.length === 0 ? 0 : Math.round((hits / listings.length) * 100);
    return { label: column.label, value: `${pct}%` };
  });
  const header = ["count", ...cells.map((c) => c.label)];
  const row = [String(listings.length), ...cells.map((c) => c.value)];
  const widths = header.map((h, i) => Math.max(h.length, (row[i] ?? "").length));
  const line = (values: string[]) =>
    values.map((v, i) => v.padStart(widths[i] ?? v.length)).join("  ");
  return [line(header), line(widths.map((w) => "-".repeat(w))), line(row)].join("\n");
}

const adapterId = process.argv[2];
const adapter = adapters.find((a) => a.id === adapterId);
if (!adapter) {
  process.stderr.write(
    `Usage: pnpm --filter @housing/sources smoke <adapterId> [--verbose]\nKnown adapters: ${adapters.map((a) => a.id).join(", ")}\n`,
  );
  process.exit(1);
}

const area = homewoodArea();
const http = createHttpClient({ log });
const browser = createBrowserPool({ log, dataDir: process.env["DATA_DIR"] ?? "./data" });
const controller = new AbortController();

const ctx: SourceContext = {
  area,
  hints: { minBeds: 4, maxPrice: null },
  config: adapter.defaultConfig,
  http,
  browser,
  log,
  signal: controller.signal,
  isKnown: () => false,
};

process.stdout.write(`\n${adapter.id} (${adapter.name}) against ${area.center.lat},${area.center.lon} r=${area.radiusMiles}mi minBeds=4\n\n`);

const setupHint = await adapter.needsSetup(ctx);
if (setupHint !== null) {
  process.stdout.write(`needs setup: ${setupHint}\n\n`);
}

const startedAt = Date.now();
let listings: RawListingInput[] = [];
try {
  listings = await adapter.search(ctx);
  const searchMs = Date.now() - startedAt;

  if (adapter.enrich) {
    const enrichCount = Math.min(ENRICH_LIMIT, listings.length);
    const enrichStart = Date.now();
    for (let i = 0; i < enrichCount; i++) {
      const target = listings[i];
      if (target) listings[i] = await adapter.enrich(target, ctx);
    }
    process.stdout.write(
      `search ${searchMs} ms, enriched ${enrichCount} in ${Date.now() - enrichStart} ms\n\n`,
    );
  } else {
    process.stdout.write(`search ${searchMs} ms, no enrich step\n\n`);
  }

  process.stdout.write(`${table(listings)}\n\n`);

  const invalid = listings.filter((l) => !RawListingSchema.safeParse(l).success);
  if (invalid.length > 0) {
    process.stdout.write(`${invalid.length} of ${listings.length} rows fail RawListingSchema\n`);
    const first = invalid[0];
    if (first) {
      for (const issue of (RawListingSchema.safeParse(first).error?.issues ?? []).slice(0, 5)) {
        process.stdout.write(`  ${issue.path.map(String).join(".")}: ${issue.message}\n`);
      }
    }
    process.stdout.write("\n");
  }

  for (const listing of listings.slice(0, 3)) {
    process.stdout.write(
      `  ${listing.title.slice(0, 60)}\n    ${listing.price ?? "?"} | ${listing.beds ?? "?"}bd | ${listing.address ?? "no address"}\n    ${listing.url}\n`,
    );
  }
} catch (error) {
  // Boundary: the point of the tool is to show exactly how a source failed.
  const name = error instanceof Error ? error.name : "Error";
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`\n${name} after ${Date.now() - startedAt} ms\n  ${message}\n`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
