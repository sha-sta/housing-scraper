import { describe, expect, it } from "vitest";
import { formatCountdown, nextCheck, nextCheckText } from "./next-check.ts";

const NOW = Date.parse("2026-10-05T16:30:00.000Z");
const inSeconds = (seconds: number) => new Date(NOW + seconds * 1000).toISOString();

const ready = { enabled: true, needsSetup: false, nextRunAt: inSeconds(130) };

describe("the next check state", () => {
  it("counts down to the planned time", () => {
    expect(nextCheck(ready, NOW)).toEqual({ kind: "countdown", seconds: 130 });
  });

  it("is paused while the source is off, whatever else is wrong", () => {
    expect(nextCheck({ ...ready, enabled: false }, NOW)).toEqual({ kind: "paused" });
    expect(nextCheck({ enabled: false, needsSetup: true, nextRunAt: null }, NOW)).toEqual({
      kind: "paused",
    });
  });

  it("asks for setup before it promises a run", () => {
    expect(nextCheck({ ...ready, needsSetup: true }, NOW)).toEqual({ kind: "setup" });
  });

  it("is running when there is no planned time", () => {
    expect(nextCheck({ ...ready, nextRunAt: null }, NOW)).toEqual({ kind: "running" });
    expect(nextCheck({ ...ready, nextRunAt: "soon" }, NOW)).toEqual({ kind: "running" });
  });

  it("is due once the countdown reaches zero", () => {
    expect(nextCheck({ ...ready, nextRunAt: inSeconds(0) }, NOW)).toEqual({ kind: "due" });
    expect(nextCheck({ ...ready, nextRunAt: inSeconds(-40) }, NOW)).toEqual({ kind: "due" });
  });
});

describe("the countdown text", () => {
  it("says minutes and seconds", () => {
    expect(formatCountdown(130)).toBe("2m 10s");
    expect(formatCountdown(60)).toBe("1m 0s");
  });

  it("drops to seconds under a minute", () => {
    expect(formatCountdown(59)).toBe("59s");
    expect(formatCountdown(0)).toBe("0s");
    expect(formatCountdown(-5)).toBe("0s");
  });

  it("drops the seconds past an hour", () => {
    expect(formatCountdown(3600)).toBe("1h 0m");
    expect(formatCountdown(3840)).toBe("1h 4m");
  });
});

describe("the column", () => {
  it("writes one phrase per state", () => {
    expect(nextCheckText(nextCheck(ready, NOW))).toBe("in 2m 10s");
    expect(nextCheckText({ kind: "paused" })).toBe("Paused");
    expect(nextCheckText({ kind: "setup" })).toBe("Needs setup");
    expect(nextCheckText({ kind: "running" })).toBe("Running");
    expect(nextCheckText({ kind: "due" })).toBe("Running");
  });
});
