import type { Logger } from "../log.ts";

// Limits published by ntfy.sh. Titles and bodies are kept far below them so a long listing title
// can never cost a push.
export const MAX_ACTIONS = 3;
export const MAX_TITLE_BYTES = 1024;
export const MAX_MESSAGE_BYTES = 4096;
/** Requests allowed in a burst before the refill rate applies. */
const BUCKET_CAPACITY = 60;
const REFILL_MS = 5_000;
const TIMEOUT_MS = 15_000;

export interface NtfyViewAction {
  action: "view";
  label: string;
  url: string;
  clear?: boolean;
}

export interface NtfyHttpAction {
  action: "http";
  label: string;
  url: string;
  method?: "POST" | "PUT" | "GET";
  headers?: Record<string, string>;
  body?: string;
  clear?: boolean;
}

export type NtfyAction = NtfyViewAction | NtfyHttpAction;

export interface NtfyMessage {
  topic: string;
  title: string;
  message: string;
  priority?: number;
  tags?: string[];
  click?: string;
  attach?: string;
  actions?: NtfyAction[];
}

export interface NtfyClient {
  publish(message: NtfyMessage): Promise<void>;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export function truncateBytes(text: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  if (encoder.encode(text).length <= maxBytes) return text;
  let cut = text;
  while (encoder.encode(`${cut}...`).length > maxBytes && cut.length > 0) {
    cut = cut.slice(0, -1);
  }
  return `${cut}...`;
}

/** Trims a message to what ntfy accepts. Actions past the third are dropped, not merged. */
export function clampMessage(message: NtfyMessage): NtfyMessage {
  const clamped: NtfyMessage = {
    ...message,
    title: truncateBytes(message.title, MAX_TITLE_BYTES),
    message: truncateBytes(message.message, MAX_MESSAGE_BYTES),
  };
  if (message.actions !== undefined && message.actions.length > MAX_ACTIONS) {
    clamped.actions = message.actions.slice(0, MAX_ACTIONS);
  }
  return clamped;
}

interface Bucket {
  tokens: number;
  lastRefill: number;
}

function takeToken(bucket: Bucket, now: number): number {
  const gained = Math.floor((now - bucket.lastRefill) / REFILL_MS);
  if (gained > 0) {
    bucket.tokens = Math.min(BUCKET_CAPACITY, bucket.tokens + gained);
    bucket.lastRefill += gained * REFILL_MS;
  }
  if (bucket.tokens > 0) {
    bucket.tokens -= 1;
    return 0;
  }
  return bucket.lastRefill + REFILL_MS - now;
}

export interface NtfyClientOptions {
  server: () => string;
  token: string | null;
  log: Logger;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
}

export function createNtfyClient(options: NtfyClientOptions): NtfyClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const bucket: Bucket = { tokens: BUCKET_CAPACITY, lastRefill: Date.now() };
  let queue: Promise<void> = Promise.resolve();

  async function send(message: NtfyMessage): Promise<void> {
    const wait = takeToken(bucket, Date.now());
    if (wait > 0) {
      await sleep(wait);
      takeToken(bucket, Date.now());
    }

    const headers: Record<string, string> = { "content-type": "application/json" };
    if (options.token !== null) headers.authorization = `Bearer ${options.token}`;

    const response = await fetchImpl(options.server().replace(/\/+$/, "") + "/", {
      method: "POST",
      headers,
      body: JSON.stringify(clampMessage(message)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`ntfy returned ${response.status}: ${(await response.text()).slice(0, 200)}`);
    }
  }

  return {
    publish(message) {
      // Serialized so the burst bucket is shared correctly across concurrent pipeline runs.
      const next = queue.then(() => send(message));
      queue = next.catch(() => {});
      return next;
    },
  };
}
