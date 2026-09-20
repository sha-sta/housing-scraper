import type {
  BrowserPool,
  BrowserPoolOptions,
  ClosableBrowserPool,
  HttpClient,
  HttpClientOptions,
  SourceAdapter,
} from "@housing/sources";
import type { Logger } from "./log.ts";

export interface SourcesModule {
  adapters: SourceAdapter[];
  createHttpClient(options: HttpClientOptions): HttpClient;
  createBrowserPool(options: BrowserPoolOptions): ClosableBrowserPool;
}

function isSourcesModule(value: unknown): value is SourcesModule {
  if (typeof value !== "object" || value === null) return false;
  const record: Record<string, unknown> = Object.fromEntries(Object.entries(value));
  return (
    Array.isArray(record.adapters) &&
    typeof record.createHttpClient === "function" &&
    typeof record.createBrowserPool === "function"
  );
}

/**
 * The adapters live in a package this app does not own. Loading them is a boundary: a machine
 * with no browsers, or a checkout where the package is still only types, still runs the rest.
 */
export async function loadSources(log: Logger): Promise<SourcesModule | null> {
  try {
    const module: unknown = await import("@housing/sources");
    if (!isSourcesModule(module)) {
      log.warn("@housing/sources has no adapters yet, running with the built-in sources only");
      return null;
    }
    return module;
  } catch (error) {
    log.error("could not load @housing/sources", { error: String(error) });
    return null;
  }
}

export function unavailableHttpClient(): HttpClient {
  return {
    fetch: async () => {
      throw new Error("the shared HTTP client is not available because @housing/sources did not load");
    },
  };
}

export function unavailableBrowserPool(): ClosableBrowserPool {
  return {
    newPage: async () => {
      throw new Error("the browser pool is not available because @housing/sources did not load");
    },
    close: async () => {},
  };
}

/**
 * The pool is built the first time a page is asked for, so a machine without browsers installed
 * still polls every HTTP source.
 */
export function lazyBrowserPool(create: () => ClosableBrowserPool): { pool: BrowserPool; close(): Promise<void> } {
  let real: ClosableBrowserPool | null = null;
  return {
    pool: {
      newPage: (options) => {
        real ??= create();
        return real.newPage(options);
      },
    },
    close: async () => {
      if (real !== null) await real.close();
      real = null;
    },
  };
}
