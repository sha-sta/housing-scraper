import {
  SourceBlockedError,
  type HttpClient,
  type HttpClientOptions,
  type HttpRequestOptions,
  type HttpResponse,
} from "./types.ts";

const DEFAULT_MIN_DELAY_MS = 2000;
const DEFAULT_RETRIES = 2;
const DEFAULT_TIMEOUT_MS = 20000;

export const CHROME_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

/**
 * The header set a desktop Chrome sends on a top-level navigation. Akamai in front of
 * offcampushousing.jhu.edu answers 403 to anything missing Sec-Fetch-* or Sec-Ch-Ua.
 *
 * Node writes Sec-Fetch-Mode itself and sends cors whatever we pass. That site answers 200
 * anyway, verified against the live host, so the built-in fetch is enough.
 */
export const CHROME_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "User-Agent": CHROME_USER_AGENT,
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Accept-Language": "en-US,en;q=0.9",
  "Sec-Ch-Ua": '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"macOS"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
});

/** Body fragments that mean a bot wall answered instead of the site. */
const CHALLENGE_MARKERS = [
  "/_incapsula_resource",
  "px-captcha",
  "_pxhd",
  "just a moment...",
  "checking your browser before accessing",
  "enable javascript and cookies to continue",
  "attention required! | cloudflare",
  "access to this page has been denied",
  "kasada",
  "please verify you are a human",
];

export function looksLikeChallenge(body: string): boolean {
  const head = body.slice(0, 4000).toLowerCase();
  return CHALLENGE_MARKERS.some((marker) => head.includes(marker));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetriableNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name !== "AbortError";
}

/** Node's type stripping does not support parameter properties, so the fields are explicit. */
class Response implements HttpResponse {
  readonly status: number;
  readonly url: string;
  readonly headers: Record<string, string>;
  private readonly body: string;

  constructor(status: number, url: string, headers: Record<string, string>, body: string) {
    this.status = status;
    this.url = url;
    this.headers = headers;
    this.body = body;
  }

  text(): Promise<string> {
    return Promise.resolve(this.body);
  }

  json<T = unknown>(): Promise<T> {
    // Callers leave T as unknown and narrow with a Zod schema; JSON.parse has no better type.
    return Promise.resolve(JSON.parse(this.body) as T);
  }
}

/**
 * One client per process. Requests to the same host are serialized and spaced by
 * minDelayMsPerHost, so a run that touches four AppFolio subdomains stays polite on each.
 */
export function createHttpClient(options: HttpClientOptions): HttpClient {
  const minDelay = options.minDelayMsPerHost ?? DEFAULT_MIN_DELAY_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const log = options.log;
  // Per host: a promise chain that resolves when the previous request's delay has elapsed.
  const hostQueue = new Map<string, Promise<void>>();

  function waitTurn(host: string): Promise<void> {
    const previous = hostQueue.get(host) ?? Promise.resolve();
    const mine = previous.then(() => sleep(minDelay));
    hostQueue.set(host, mine);
    return previous;
  }

  async function once(url: string, opts: HttpRequestOptions): Promise<Response> {
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const signals = [AbortSignal.timeout(timeoutMs)];
    if (opts.signal) signals.push(opts.signal);
    const headers: Record<string, string> = opts.browserHeaders
      ? { ...CHROME_HEADERS, ...opts.headers }
      : { "User-Agent": CHROME_USER_AGENT, "Accept-Language": "en-US,en;q=0.9", ...opts.headers };

    const res = await fetch(url, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body,
      redirect: "follow",
      signal: AbortSignal.any(signals),
    });
    const body = await res.text();
    const flat: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      flat[key] = value;
    });
    return new Response(res.status, res.url, flat, body);
  }

  return {
    async fetch(url: string, opts: HttpRequestOptions = {}): Promise<HttpResponse> {
      const host = new URL(url).host;
      let lastError: unknown = null;

      for (let attempt = 0; attempt <= retries; attempt++) {
        await waitTurn(host);
        let res: Response;
        try {
          res = await once(url, opts);
        } catch (error) {
          lastError = error;
          if (attempt < retries && isRetriableNetworkError(error)) {
            const backoff = minDelay * 2 ** attempt;
            log.warn("http retry after network error", { url, attempt, backoff });
            await sleep(backoff);
            continue;
          }
          throw error;
        }

        if (res.status === 403 || res.status === 429) {
          throw new SourceBlockedError(`${host} answered ${res.status} for ${url}`);
        }
        if (res.status >= 500) {
          lastError = new Error(`${host} answered ${res.status} for ${url}`);
          if (attempt < retries) {
            const backoff = minDelay * 2 ** attempt;
            log.warn("http retry after server error", { url, status: res.status, attempt, backoff });
            await sleep(backoff);
            continue;
          }
          throw lastError;
        }
        const body = await res.text();
        if (looksLikeChallenge(body)) {
          throw new SourceBlockedError(`${host} served a challenge page for ${url}`);
        }
        return res;
      }

      throw lastError instanceof Error ? lastError : new Error(`request to ${url} failed`);
    },
  };
}
