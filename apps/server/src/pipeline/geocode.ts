import { z } from "zod";
import type { Logger } from "../log.ts";
import type { ConfigRepo } from "../db/repo/index.ts";

/** Required by the Census Bureau terms of service wherever this geocoder is used. */
export const CENSUS_ATTRIBUTION =
  "This product uses the Census Bureau Data API but is not endorsed or certified by the Census Bureau.";

const CENSUS_URL = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";
const TIMEOUT_MS = 12_000;

const CensusResponseSchema = z.object({
  result: z.object({
    addressMatches: z.array(
      z.object({
        coordinates: z.object({ x: z.number(), y: z.number() }),
        matchedAddress: z.string().optional(),
      }),
    ),
  }),
});

export interface GeocodeResult {
  lat: number;
  lon: number;
}

export interface Geocoder {
  lookup(address: string | null, key: string | null): Promise<GeocodeResult | null>;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

async function askCensus(address: string, fetchImpl: FetchLike): Promise<GeocodeResult | null> {
  const url = new URL(CENSUS_URL);
  url.searchParams.set("address", address);
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("format", "json");

  const response = await fetchImpl(url.toString(), {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`census geocoder returned ${response.status}`);

  const parsed = CensusResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error(`census geocoder returned an unexpected shape: ${parsed.error.message}`);

  const first = parsed.data.result.addressMatches[0];
  if (first === undefined) return null;
  return { lat: first.coordinates.y, lon: first.coordinates.x };
}

/**
 * Census only. Hits and misses are both cached forever, so one bad address costs one round trip
 * for the life of the database. Most sources already publish coordinates, so this is the exception
 * path rather than the normal one.
 */
export function createGeocoder(config: ConfigRepo, log: Logger, fetchImpl: FetchLike = fetch): Geocoder {
  return {
    async lookup(address, key) {
      if (address === null || key === null) return null;

      const cached = config.getGeocode(key);
      if (cached !== null) {
        return cached.lat === null || cached.lon === null ? null : { lat: cached.lat, lon: cached.lon };
      }

      // The Census service is flaky under load, so one miss is retried before it is believed.
      let result: GeocodeResult | null = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          result = await askCensus(address, fetchImpl);
          if (result !== null) break;
        } catch (error) {
          log.warn("geocode attempt failed", { address, attempt, error: String(error) });
          if (attempt === 1) return null;
        }
      }

      config.putGeocode(
        key,
        { lat: result?.lat ?? null, lon: result?.lon ?? null, matchedAddress: address },
        new Date().toISOString(),
      );
      return result;
    },
  };
}
