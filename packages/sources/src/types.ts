import type { RawListingInput } from "@housing/shared";

export interface GeoPoint {
  lat: number;
  lon: number;
}

/** The union of what every enabled profile could want. One poll per source serves all profiles. */
export interface SearchArea {
  center: GeoPoint;
  radiusMiles: number;
  bbox: { minLat: number; minLon: number; maxLat: number; maxLon: number };
  zips: string[];
  neighborhoods: string[];
}

/** Loosest bounds across enabled profiles. Adapters may use them to narrow a query and may ignore them. */
export interface SearchHints {
  minBeds: number | null;
  maxPrice: number | null;
}

export interface HttpResponse {
  status: number;
  url: string;
  headers: Record<string, string>;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
}

export interface HttpRequestOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  // Sends the full desktop Chrome header set (Accept, Accept-Language, Sec-Ch-Ua, Sec-Fetch-*)
  browserHeaders?: boolean;
  timeoutMs?: number;
  // Cancels the request when the caller gives up. Combined with the client's own timeout.
  signal?: AbortSignal;
}

/** Shared by every adapter. Enforces a per-host minimum delay and retries transient failures. */
export interface HttpClient {
  fetch(url: string, options?: HttpRequestOptions): Promise<HttpResponse>;
}

export interface BrowserPage {
  goto(url: string): Promise<void>;
  content(): Promise<string>;
  evaluate<T>(fn: string): Promise<T>;
  waitForSelector(selector: string, timeoutMs?: number): Promise<void>;
  scrollToBottom(): Promise<void>;
  close(): Promise<void>;
  // Lets a page settle after a scroll triggers a lazy fetch. Callers use optional chaining.
  waitForTimeout?(ms: number): Promise<void>;
  // Current URL after redirects. Account sources read it to detect a login wall.
  url?(): string;
}

export interface BrowserPool {
  /**
   * profileName selects a persistent on-disk browser profile (data/browser-profiles/<name>).
   * Account sources use it to reuse the user's own login. Omit it for a throwaway context.
   */
  newPage(options?: { profileName?: string }): Promise<BrowserPage>;
}

export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

export interface SourceContext {
  area: SearchArea;
  hints: SearchHints;
  // Per-source user config from the dashboard, e.g. { subdomains: string[] } for AppFolio
  config: Record<string, unknown>;
  http: HttpClient;
  browser: BrowserPool;
  log: Logger;
  signal: AbortSignal;
  // True when this source listing id is already stored. Lets search() skip detail fetches.
  isKnown(sourceListingId: string): boolean;
}

export type SourceKind = "http" | "browser" | "account";

export interface SourceAdapter {
  id: string;
  name: string;
  kind: SourceKind;
  homepage: string;
  defaultIntervalSec: number;
  defaultEnabled: boolean;
  defaultConfig: Record<string, unknown>;
  /** Returns a human-readable hint when the source cannot run yet, or null when it is ready. */
  needsSetup(ctx: Pick<SourceContext, "config" | "browser">): Promise<string | null>;
  /** Newest listings in the area. Must be cheap: one or a few requests. Throw on a block or a layout change. */
  search(ctx: SourceContext): Promise<RawListingInput[]>;
  /** Optional detail fetch, called once per new listing, for description, photos, and contact info. */
  enrich?(listing: RawListingInput, ctx: SourceContext): Promise<RawListingInput>;
}

/** Thrown when the site answered but refused us (403, 429, challenge page). The scheduler backs off harder. */
export class SourceBlockedError extends Error {
  override name = "SourceBlockedError";
}

/** Thrown when the response parsed to nothing recognizable, which means the site changed its layout. */
export class SourceLayoutError extends Error {
  override name = "SourceLayoutError";
}

export interface HttpClientOptions {
  log: Logger;
  // Minimum gap between two requests to the same host. Default 2000.
  minDelayMsPerHost?: number;
  retries?: number;
}

export interface BrowserPoolOptions {
  log: Logger;
  // Persistent profiles live under <dataDir>/browser-profiles/<profileName>
  dataDir: string;
  headless?: boolean;
}

export interface ClosableBrowserPool extends BrowserPool {
  close(): Promise<void>;
}
