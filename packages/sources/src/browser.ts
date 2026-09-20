import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  BrowserPage,
  BrowserPoolOptions,
  ClosableBrowserPool,
  Logger,
} from "./types.ts";
import { CHROME_USER_AGENT } from "./http.ts";

type PlaywrightModule = typeof import("playwright");
type Browser = import("playwright").Browser;
type BrowserContext = import("playwright").BrowserContext;
type Page = import("playwright").Page;

const NAV_TIMEOUT_MS = 45000;
const SELECTOR_TIMEOUT_MS = 15000;

const CONTEXT_OPTIONS = {
  userAgent: CHROME_USER_AGENT,
  viewport: { width: 1440, height: 900 },
  locale: "en-US",
  timezoneId: "America/New_York",
} as const;

/** Playwright is loaded on first use so a machine with no browser binaries can still run HTTP adapters. */
async function loadPlaywright(): Promise<PlaywrightModule> {
  return import("playwright");
}

/** Node's type stripping does not support parameter properties, so the field is explicit. */
class PlaywrightPage implements BrowserPage {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
  }

  content(): Promise<string> {
    return this.page.content();
  }

  evaluate<T>(fn: string): Promise<T> {
    return this.page.evaluate<T>(fn);
  }

  /**
   * Waits for the node to exist, not to be visible. Adapters wait on things that never
   * render, such as a meta tag or an inline script that carries the page state.
   */
  async waitForSelector(selector: string, timeoutMs = SELECTOR_TIMEOUT_MS): Promise<void> {
    await this.page.waitForSelector(selector, { timeout: timeoutMs, state: "attached" });
  }

  async scrollToBottom(): Promise<void> {
    await this.page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
  }

  waitForTimeout(ms: number): Promise<void> {
    return this.page.waitForTimeout(ms);
  }

  url(): string {
    return this.page.url();
  }

  async close(): Promise<void> {
    await this.page.close();
  }
}

/**
 * Lazily launches one headless Chromium for throwaway pages, plus one persistent context per
 * named profile. A persistent profile keeps the user's own login on disk and is never shared
 * between profile names.
 */
export function createBrowserPool(options: BrowserPoolOptions): ClosableBrowserPool {
  const log: Logger = options.log;
  const headless = options.headless ?? true;
  let shared: Promise<{ browser: Browser; context: BrowserContext }> | null = null;
  const persistent = new Map<string, Promise<BrowserContext>>();

  async function sharedContext(): Promise<BrowserContext> {
    shared ??= (async () => {
      const { chromium } = await loadPlaywright();
      log.debug("launching shared chromium", { headless });
      const browser = await chromium.launch({ headless });
      const context = await browser.newContext(CONTEXT_OPTIONS);
      return { browser, context };
    })();
    return (await shared).context;
  }

  async function profileContext(profileName: string): Promise<BrowserContext> {
    let existing = persistent.get(profileName);
    if (!existing) {
      existing = (async () => {
        const { chromium } = await loadPlaywright();
        const dir = join(options.dataDir, "browser-profiles", profileName);
        await mkdir(dir, { recursive: true });
        log.debug("launching persistent chromium profile", { profileName, headless });
        return chromium.launchPersistentContext(dir, { ...CONTEXT_OPTIONS, headless });
      })();
      persistent.set(profileName, existing);
    }
    return existing;
  }

  return {
    async newPage(pageOptions?: { profileName?: string }): Promise<BrowserPage> {
      const context = pageOptions?.profileName
        ? await profileContext(pageOptions.profileName)
        : await sharedContext();
      return new PlaywrightPage(await context.newPage());
    },

    async close(): Promise<void> {
      for (const [name, contextPromise] of persistent) {
        const context = await contextPromise;
        await context.close();
        log.debug("closed persistent chromium profile", { profileName: name });
      }
      persistent.clear();
      if (shared) {
        const { browser } = await shared;
        await browser.close();
        shared = null;
      }
    },
  };
}

/**
 * Opens a headed persistent profile and resolves when the user closes the window.
 * The scripts under bin/ use this so the repo never handles a password or a cookie.
 */
export async function openHeadedProfile(
  dataDir: string,
  profileName: string,
  startUrl: string,
): Promise<{ context: BrowserContext; page: Page; closed: Promise<void> }> {
  const { chromium } = await loadPlaywright();
  const dir = join(dataDir, "browser-profiles", profileName);
  await mkdir(dir, { recursive: true });
  const context = await chromium.launchPersistentContext(dir, {
    ...CONTEXT_OPTIONS,
    headless: false,
  });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
  const closed = new Promise<void>((resolve) => context.on("close", () => resolve()));
  return { context, page, closed };
}
