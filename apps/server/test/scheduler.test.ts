import type { SourceAdapter } from "@housing/sources";
import { afterEach, describe, expect, it } from "vitest";
import { silentLogger } from "../src/log.ts";
import { createHealthNotifier } from "../src/notify/health.ts";
import { createScheduler, type Scheduler } from "../src/scheduler.ts";
import { unavailableBrowserPool, unavailableHttpClient } from "../src/sources.ts";
import { createHarness, fakeAdapter, type Harness } from "./harness.ts";

/** fakeAdapter's default interval, which seed copies onto the source row. */
const INTERVAL_MS = 300_000;

let harness: Harness;
let scheduler: Scheduler | null = null;

function makeScheduler(adapters: SourceAdapter[]): Scheduler {
  return createScheduler({
    adapters,
    repos: harness.repos,
    pipeline: harness.pipeline,
    bus: harness.bus,
    health: createHealthNotifier(harness.repos.profiles, harness.notifier),
    log: silentLogger(),
    http: unavailableHttpClient(),
    browser: () => unavailableBrowserPool(),
  });
}

afterEach(async () => {
  if (scheduler !== null) await scheduler.stop();
  scheduler = null;
  harness.close();
});

describe("next run time", () => {
  it("plans the next run inside the jitter band once a run finishes", async () => {
    const adapter = fakeAdapter("fake", () => []);
    harness = createHarness({ adapters: [adapter] });
    scheduler = makeScheduler([adapter]);
    scheduler.start();

    const before = Date.now();
    await scheduler.runNow("fake");
    const after = Date.now();

    const next = scheduler.nextRunAt("fake");
    expect(next).not.toBeNull();
    // The timer was created somewhere between before and after, so the band holds against both ends.
    const due = Date.parse(next!);
    expect(due - before).toBeGreaterThanOrEqual(INTERVAL_MS * 0.85);
    expect(due - after).toBeLessThanOrEqual(INTERVAL_MS * 1.15);
  });

  it("reports no next run for a disabled source", async () => {
    const adapter = fakeAdapter("fake", () => []);
    harness = createHarness({ adapters: [adapter] });
    scheduler = makeScheduler([adapter]);
    scheduler.start();
    await scheduler.runNow("fake");
    expect(scheduler.nextRunAt("fake")).not.toBeNull();

    harness.repos.config.updateSource("fake", { enabled: false });
    expect(scheduler.nextRunAt("fake")).toBeNull();
  });

  it("reports no next run while a source is running or needs setup", async () => {
    let release = (): void => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const adapter: SourceAdapter = {
      ...fakeAdapter("fake", () => []),
      search: async () => {
        await held;
        return [];
      },
    };
    harness = createHarness({ adapters: [adapter] });
    scheduler = makeScheduler([adapter]);
    scheduler.start();

    const run = scheduler.runNow("fake");
    expect(scheduler.nextRunAt("fake")).toBeNull();
    release();
    await run;
    expect(scheduler.nextRunAt("fake")).not.toBeNull();

    harness.repos.config.updateSource("fake", { needsSetup: true });
    expect(scheduler.nextRunAt("fake")).toBeNull();
  });

  it("reports no next run for a source the scheduler never started", async () => {
    const adapter = fakeAdapter("fake", () => []);
    harness = createHarness({ adapters: [adapter] });
    scheduler = makeScheduler([adapter]);
    expect(scheduler.nextRunAt("fake")).toBeNull();
    expect(scheduler.nextRunAt("nope")).toBeNull();
  });
});
