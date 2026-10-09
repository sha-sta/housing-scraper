import type { Logger } from "../log.ts";
import type { FetchLike } from "./ntfy.ts";

/** A push should not wait on a slow image host, so the check gives up quickly. */
const TIMEOUT_MS = 2_000;
/** How long one hostname's verdict stands. A host's policy does not change by the minute. */
const CACHE_MS = 6 * 60 * 60 * 1000;
/** Photos to try before the push goes out with no picture at all. */
const MAX_CANDIDATES = 3;

/**
 * Some portals, the JHU one among them, serve photos only to a browser that is mid-session and
 * answer everything else with 403. Asking as a browser is what tells those two cases apart.
 */
const BROWSER_HEADERS: Record<string, string> = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
};

export interface PhotoChecker {
  /** The first photo an ntfy attachment can use, or null when none of them load. */
  pick(photos: string[]): Promise<string | null>;
}

export interface PhotoCheckerOptions {
  log: Logger;
  fetchImpl?: FetchLike;
  now?: () => number;
}

export function createPhotoChecker(options: PhotoCheckerOptions): PhotoChecker {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? ((): number => Date.now());
  /** Keyed by hostname, so a host that refuses us costs one request every six hours, not one per push. */
  const verdicts = new Map<string, { ok: boolean; at: number }>();

  async function loads(url: string): Promise<boolean> {
    try {
      const response = await fetchImpl(url, {
        method: "HEAD",
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const contentType = response.headers.get("content-type") ?? "";
      // A 200 that answers with a login page is still a dead attachment.
      return response.ok && contentType.toLowerCase().startsWith("image/");
    } catch (error) {
      // A refused, slow, or unresolvable host is just a photo we do not attach.
      options.log.debug("photo did not answer", { url, error: String(error) });
      return false;
    }
  }

  return {
    async pick(photos) {
      for (const url of photos.slice(0, MAX_CANDIDATES)) {
        const hostname = URL.parse(url)?.hostname;
        if (hostname === undefined || hostname === "") continue;

        const cached = verdicts.get(hostname);
        if (cached !== undefined && now() - cached.at < CACHE_MS) {
          if (cached.ok) return url;
          continue;
        }

        const ok = await loads(url);
        verdicts.set(hostname, { ok, at: now() });
        if (ok) return url;
      }
      return null;
    },
  };
}
