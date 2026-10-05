import type { Profile } from "@housing/shared";
import type { SourceAdapter } from "@housing/sources";
import { afterEach, describe, expect, it } from "vitest";
import type { Logger } from "../src/log.ts";
import { silentLogger } from "../src/log.ts";
import { createHealthNotifier } from "../src/notify/health.ts";
import { createScheduler, type Scheduler } from "../src/scheduler.ts";
import { unavailableBrowserPool, unavailableHttpClient } from "../src/sources.ts";
import { addProfile, createHarness, fakeAdapter, type Harness } from "./harness.ts";
import { makePreferences } from "./helpers.ts";

/** fakeAdapter's default interval, which seed copies onto the source row. */
const INTERVAL_MS = 300_000;

let harness: Harness;
let scheduler: Scheduler | null = null;
let infoLines: { msg: string; data: Record<string, unknown> | undefined }[] = [];

function recordingLogger(): Logger {
  return {
    ...silentLogger(),
    info: (msg, data) => infoLines.push({ msg, data }),
  };
}

function makeScheduler(adapters: SourceAdapter[]): Scheduler {
  return createScheduler({
    adapters,
    repos: harness.repos,
    pipeline: harness.pipeline,
    bus: harness.bus,
    health: createHealthNotifier(harness.repos.profiles, harness.notifier),
    log: recordingLogger(),
    http: unavailableHttpClient(),
    browser: () => unavailableBrowserPool(),
  });
}

/** A profile whose walk ceiling, and so whose share of the union search area, is known. */
function addWalkProfile(minutes: number): Profile {
  return addProfile(harness, {
    preferences: makePreferences((p) => ({
      ...p,
      location: { ...p.location, maxWalkMinutes: minutes, idealWalkMinutes: 5 },
      notify: { ...p.notify, topic: "owner-topic", minScore: 0 },
    })),
  });
}

function setWalkMinutes(profile: Profile, minutes: number): void {
  harness.repos.profiles.update({
    ...profile,
    preferences: {
      ...profile.preferences,
      location: { ...profile.preferences.location, maxWalkMinutes: minutes },
    },
  });
}

afterEach(async () => {
  if (scheduler !== null) await scheduler.stop();
  scheduler = null;
  infoLines = [];
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

describe("rerun after a profile widens the area", () => {
  let searches = 0;

  function startWithProfile(walkMinutes: number): Profile {
    const adapter = fakeAdapter("fake", () => {
      searches += 1;
      return [];
    });
    harness = createHarness({ adapters: [adapter] });
    const profile = addWalkProfile(walkMinutes);
    scheduler = makeScheduler([adapter]);
    scheduler.start();
    return profile;
  }

  afterEach(() => {
    searches = 0;
  });

  it("runs the source again when a profile widens the walk minutes", async () => {
    const profile = startWithProfile(10);
    await scheduler!.runNow("fake");
    expect(searches).toBe(1);

    setWalkMinutes(profile, 20);
    await scheduler!.rerunIfAreaWidened();
    expect(searches).toBe(2);

    // 10 walk minutes is a 0.63 mile radius with the margin, 20 is 1.25.
    const widened = infoLines.filter((line) => line.msg.includes("search area widened"));
    expect(widened).toHaveLength(1);
    expect(widened[0]?.data).toMatchObject({ oldRadiusMiles: 0.63, newRadiusMiles: 1.25 });
  });

  it("leaves the schedule alone when a profile narrows the walk minutes", async () => {
    const profile = startWithProfile(10);
    await scheduler!.runNow("fake");
    expect(searches).toBe(1);

    setWalkMinutes(profile, 5);
    await scheduler!.rerunIfAreaWidened();
    expect(searches).toBe(1);
    expect(infoLines.some((line) => line.msg.includes("search area widened"))).toBe(false);
  });

  it("skips a disabled source and a source that needs setup", async () => {
    const profile = startWithProfile(10);
    await scheduler!.runNow("fake");
    harness.repos.config.updateSource("fake", { enabled: false });

    setWalkMinutes(profile, 20);
    await scheduler!.rerunIfAreaWidened();
    expect(searches).toBe(1);

    harness.repos.config.updateSource("fake", { enabled: true, needsSetup: true });
    setWalkMinutes(profile, 40);
    await scheduler!.rerunIfAreaWidened();
    expect(searches).toBe(1);
  });

  it("does nothing before the first run, because that run uses the new area", async () => {
    const profile = startWithProfile(10);
    setWalkMinutes(profile, 20);
    await scheduler!.rerunIfAreaWidened();
    expect(searches).toBe(0);
  });
});
