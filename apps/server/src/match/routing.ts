import type { Anchor, Listing } from "@housing/shared";
import { z } from "zod";
import type { ConfigRepo } from "../db/repo/index.ts";
import type { Logger } from "../log.ts";

const TIMEOUT_MS = 8_000;

const ValhallaResponseSchema = z.object({
  trip: z.object({ summary: z.object({ time: z.number() }) }),
});

export interface Router {
  /** Pedestrian minutes, or null to let the haversine fallback in evaluate apply. */
  walkMinutes(listing: Listing, anchor: Anchor): Promise<number | null>;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export function createRouter(
  config: ConfigRepo,
  log: Logger,
  valhallaUrl: string | null,
  fetchImpl: FetchLike = fetch,
): Router {
  if (valhallaUrl === null) {
    return { walkMinutes: async () => null };
  }
  const base = valhallaUrl.replace(/\/+$/, "");

  return {
    async walkMinutes(listing, anchor) {
      if (listing.lat === null || listing.lon === null) return null;
      const key = `${listing.id}:${anchor.lat.toFixed(5)},${anchor.lon.toFixed(5)}`;
      const cached = config.getRoute(key);
      if (cached !== undefined) return cached;

      let minutes: number | null = null;
      try {
        const response = await fetchImpl(`${base}/route`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            locations: [
              { lat: listing.lat, lon: listing.lon },
              { lat: anchor.lat, lon: anchor.lon },
            ],
            costing: "pedestrian",
            directions_options: { units: "miles" },
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!response.ok) throw new Error(`valhalla returned ${response.status}`);
        const parsed = ValhallaResponseSchema.safeParse(await response.json());
        if (!parsed.success) throw new Error("valhalla returned an unexpected shape");
        minutes = parsed.data.trip.summary.time / 60;
      } catch (error) {
        log.warn("pedestrian routing failed, falling back to straight line", { error: String(error) });
        return null;
      }

      config.putRoute(key, minutes, new Date().toISOString());
      return minutes;
    },
  };
}
