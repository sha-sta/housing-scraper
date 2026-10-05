import { getCampus, type CampusPreset, type Profile } from "@housing/shared";
import type {
  BrowserPool,
  HttpClient,
  SearchArea,
  SearchHints,
  SourceAdapter,
  SourceContext,
} from "@housing/sources";
import type { EventBus } from "./api/events.ts";
import type { Repos } from "./db/repo/index.ts";
import type { Logger } from "./log.ts";
import { haversineMiles, WALK_MPH } from "./match/geo.ts";
import { DOWN_THRESHOLD, type HealthNotifier } from "./notify/health.ts";
import type { Pipeline } from "./pipeline/run.ts";

/** Plus or minus this much, so several sources do not line up on the same second forever. */
const JITTER = 0.15;
const BACKOFF_BASE_MS = 60_000;
const BACKOFF_CAP_MS = 60 * 60 * 1000;
/** Headroom on the search radius, because a walk radius is not a driving radius. */
const AREA_MARGIN = 1.25;
const MILES_PER_DEGREE_LAT = 69;
/** A center that moves less than this covers the same blocks, so it is not worth a rerun. */
const AREA_MOVE_METERS = 200;
const METERS_PER_MILE = 1609.344;

interface Circle {
  lat: number;
  lon: number;
  radiusMiles: number;
}

function circleFor(profile: Profile, fallbackRadius: number): Circle {
  const anchor = profile.preferences.location.anchor;
  const minutes = profile.preferences.location.maxWalkMinutes;
  const radius = minutes === null ? fallbackRadius : (minutes / 60) * WALK_MPH * AREA_MARGIN;
  return { lat: anchor.lat, lon: anchor.lon, radiusMiles: radius };
}

function lonDegrees(miles: number, lat: number): number {
  const scale = Math.cos((lat * Math.PI) / 180);
  return miles / (MILES_PER_DEGREE_LAT * Math.max(0.1, scale));
}

/** One poll serves every profile, so the area has to cover all of their circles. */
export function unionSearchArea(profiles: Profile[], campus: CampusPreset): SearchArea {
  const circles =
    profiles.length === 0
      ? [{ lat: campus.anchor.lat, lon: campus.anchor.lon, radiusMiles: campus.searchRadiusMiles }]
      : profiles.map((p) => circleFor(p, campus.searchRadiusMiles));

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const circle of circles) {
    const dLat = circle.radiusMiles / MILES_PER_DEGREE_LAT;
    const dLon = lonDegrees(circle.radiusMiles, circle.lat);
    minLat = Math.min(minLat, circle.lat - dLat);
    maxLat = Math.max(maxLat, circle.lat + dLat);
    minLon = Math.min(minLon, circle.lon - dLon);
    maxLon = Math.max(maxLon, circle.lon + dLon);
  }

  const center = { lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 };
  const radiusMiles = Math.max(
    ((maxLat - minLat) / 2) * MILES_PER_DEGREE_LAT,
    ((maxLon - minLon) / 2) * MILES_PER_DEGREE_LAT * Math.cos((center.lat * Math.PI) / 180),
  );

  const neighborhoods = new Set(campus.neighborhoods);
  for (const profile of profiles) {
    for (const name of profile.preferences.location.neighborhoodsInclude) neighborhoods.add(name);
  }

  return {
    center,
    radiusMiles,
    bbox: { minLat, minLon, maxLat, maxLon },
    zips: campus.zips,
    neighborhoods: [...neighborhoods],
  };
}

export function searchHints(profiles: Profile[]): SearchHints {
  if (profiles.length === 0) return { minBeds: null, maxPrice: null };
  const minBeds = Math.min(...profiles.map((p) => p.preferences.beds.min));
  const prices = profiles.map((p) => p.preferences.price.maxTotal);
  const maxPrice = prices.includes(null) ? null : Math.max(...prices.filter((p): p is number => p !== null));
  return { minBeds: Number.isFinite(minBeds) ? minBeds : null, maxPrice };
}

function isBlocked(error: unknown): boolean {
  return error instanceof Error && error.name === "SourceBlockedError";
}

export interface Scheduler {
  start(): void;
  stop(): Promise<void>;
  runNow(sourceId: string): Promise<void>;
  /** When the pending timer for this source is due. Null while it is disabled, unset up, or running. */
  nextRunAt(sourceId: string): string | null;
  /**
   * Runs every ready source again when the enabled profiles now cover more ground than the last
   * run asked for. Resolves once those runs are done, so callers that must stay quick do not await it.
   */
  rerunIfAreaWidened(): Promise<void>;
}

export interface SchedulerOptions {
  adapters: SourceAdapter[];
  repos: Repos;
  pipeline: Pipeline;
  bus: EventBus;
  health: HealthNotifier;
  log: Logger;
  http: HttpClient;
  browser(): BrowserPool;
}

export function createScheduler(options: SchedulerOptions): Scheduler {
  const { adapters, repos, pipeline, bus, health, log } = options;
  const timers = new Map<string, NodeJS.Timeout>();
  /** Epoch milliseconds each pending timer is due, so the dashboard can show a countdown. */
  const dueAt = new Map<string, number>();
  const inFlight = new Map<string, Promise<void>>();
  const aborts = new Map<string, AbortController>();
  let running = false;
  /** The area the most recent run asked for, which is what a profile edit is compared against. */
  let lastRunArea: SearchArea | null = null;

  function areaFor(profiles: Profile[]): SearchArea {
    const settings = repos.config.getSettings();
    const campus = getCampus(settings?.campusId ?? "homewood") ?? getCampus("homewood");
    if (campus === undefined) throw new Error("no campus preset is available");
    return unionSearchArea(profiles, campus);
  }

  function buildContext(sourceId: string, config: Record<string, unknown>, signal: AbortSignal): SourceContext {
    const profiles = repos.profiles.enabled();
    const area = areaFor(profiles);
    lastRunArea = area;
    const known = repos.listings.knownSourceListingIds(sourceId);

    return {
      area,
      hints: searchHints(profiles),
      config,
      http: options.http,
      browser: options.browser(),
      log,
      signal,
      isKnown: (sourceListingId) => known.has(sourceListingId),
    };
  }

  function nextDelay(intervalSec: number): number {
    const factor = 1 + (Math.random() * 2 - 1) * JITTER;
    return Math.max(5_000, intervalSec * 1000 * factor);
  }

  function schedule(sourceId: string): void {
    if (!running) return;
    const source = repos.config.getSource(sourceId);
    if (source === null || !source.enabled) return;

    const backoffLeft =
      source.backoffUntil === null ? 0 : Math.max(0, Date.parse(source.backoffUntil) - Date.now());
    const delay = Math.max(backoffLeft, nextDelay(source.intervalSec));

    const timer = setTimeout(() => {
      void runOnce(sourceId);
    }, delay);
    timer.unref();
    timers.set(sourceId, timer);
    dueAt.set(sourceId, Date.now() + delay);
  }

  async function execute(adapter: SourceAdapter, sourceId: string): Promise<void> {
    const source = repos.config.getSource(sourceId);
    if (source === null || !source.enabled) return;

    const controller = new AbortController();
    aborts.set(sourceId, controller);
    const startedAt = new Date().toISOString();
    repos.config.updateSource(sourceId, { lastRunAt: startedAt });

    try {
      const ctx = buildContext(sourceId, source.config, controller.signal);
      const hint = await adapter.needsSetup({ config: source.config, browser: ctx.browser });
      if (hint !== null) {
        repos.config.updateSource(sourceId, { needsSetup: true, setupHint: hint });
        return;
      }

      const result = await pipeline.runSource(adapter, source, ctx);
      const finishedAt = new Date().toISOString();
      repos.config.updateSource(sourceId, {
        needsSetup: false,
        setupHint: null,
        lastSuccessAt: finishedAt,
        lastError: null,
        consecutiveFailures: 0,
        lastRunCount: result.valid,
        totalListings: source.totalListings + result.created,
        baselineAt: source.baselineAt ?? finishedAt,
        backoffUntil: null,
        downNotifiedAt: null,
      });
      log.info("source run finished", { sourceId, ...result });

      if (source.downNotifiedAt !== null) await health.sourceRecovered(source);
    } catch (error) {
      // A run cut short by shutdown is not the site's fault, so it never counts toward sourceDown.
      if (controller.signal.aborted) return;

      const failures = source.consecutiveFailures + 1;
      const blocked = isBlocked(error);
      const backoffUntil = blocked
        ? new Date(Date.now() + Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** (failures - 1))).toISOString()
        : null;
      repos.config.updateSource(sourceId, {
        lastError: String(error),
        consecutiveFailures: failures,
        backoffUntil,
      });
      log.warn("source run failed", { sourceId, failures, blocked, error: String(error) });

      if (failures >= DOWN_THRESHOLD && source.downNotifiedAt === null) {
        const current = repos.config.getSource(sourceId);
        if (current !== null) await health.sourceDown(current);
        repos.config.updateSource(sourceId, { downNotifiedAt: new Date().toISOString() });
      }
    } finally {
      aborts.delete(sourceId);
      bus.publish({ type: "source.status", sourceId });
    }
  }

  /** One run of a source at a time. A second caller joins the run already in flight. */
  function runOnce(sourceId: string): Promise<void> {
    const existing = inFlight.get(sourceId);
    if (existing !== undefined) return existing;

    const adapter = adapters.find((a) => a.id === sourceId);
    if (adapter === undefined) return Promise.resolve();

    const promise = execute(adapter, sourceId).finally(() => {
      inFlight.delete(sourceId);
      schedule(sourceId);
    });
    inFlight.set(sourceId, promise);
    dueAt.delete(sourceId);
    return promise;
  }

  /** Drops the pending timer and runs the source now. Reused by the API and by a widened area. */
  function runNow(sourceId: string): Promise<void> {
    const timer = timers.get(sourceId);
    if (timer !== undefined) clearTimeout(timer);
    return runOnce(sourceId);
  }

  return {
    start() {
      if (running) return;
      running = true;
      for (const adapter of adapters) {
        const source = repos.config.getSource(adapter.id);
        if (source === null || !source.enabled) continue;
        // Stagger the first runs so the very first boot does not hit every site at once.
        const delay = 2_000 + Math.random() * 3_000;
        const timer = setTimeout(() => void runOnce(adapter.id), delay);
        timer.unref();
        timers.set(adapter.id, timer);
        dueAt.set(adapter.id, Date.now() + delay);
      }
      log.info("scheduler started", { sources: adapters.length });
    },

    async stop() {
      running = false;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      dueAt.clear();
      for (const controller of aborts.values()) controller.abort();
      await Promise.allSettled([...inFlight.values()]);
    },

    runNow,

    async rerunIfAreaWidened() {
      const previous = lastRunArea;
      // Nothing has run yet, so the first run of every source will already use the new area.
      if (previous === null) return;

      const next = areaFor(repos.profiles.enabled());
      const movedMeters = haversineMiles(previous.center, next.center) * METERS_PER_MILE;
      if (next.radiusMiles <= previous.radiusMiles && movedMeters <= AREA_MOVE_METERS) return;

      log.info("search area widened, rerunning the ready sources", {
        oldRadiusMiles: Number(previous.radiusMiles.toFixed(2)),
        newRadiusMiles: Number(next.radiusMiles.toFixed(2)),
        centerMovedMeters: Math.round(movedMeters),
      });
      // Claimed before the runs start, so two edits in a row do not each rerun everything.
      lastRunArea = next;

      for (const source of repos.config.listSources()) {
        if (!source.enabled || source.needsSetup) continue;
        // runNow joins a run already in flight rather than starting a second one.
        await runNow(source.id);
      }
    },

    nextRunAt(sourceId) {
      const source = repos.config.getSource(sourceId);
      // A source that cannot run has no next run to show, whatever timer history it has.
      if (source === null || !source.enabled || source.needsSetup) return null;
      if (inFlight.has(sourceId)) return null;
      const due = dueAt.get(sourceId);
      return due === undefined ? null : new Date(due).toISOString();
    },
  };
}
