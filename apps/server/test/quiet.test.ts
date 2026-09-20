import { describe, expect, it } from "vitest";
import { isQuiet, minutesOfDay, parseHhMm } from "../src/notify/quiet.ts";

/** Local time, because a quiet window means the hours the person is asleep where they are. */
function at(hours: number, minutes = 0): Date {
  const date = new Date(2026, 8, 20, hours, minutes, 0, 0);
  return date;
}

describe("parseHhMm", () => {
  it("reads a valid time", () => {
    expect(parseHhMm("23:00")).toBe(1380);
    expect(parseHhMm("00:00")).toBe(0);
    expect(parseHhMm("07:30")).toBe(450);
    expect(parseHhMm(" 09:15 ")).toBe(555);
  });

  it("rejects anything that is not HH:MM", () => {
    expect(parseHhMm("24:00")).toBeNull();
    expect(parseHhMm("7:30")).toBeNull();
    expect(parseHhMm("23:60")).toBeNull();
    expect(parseHhMm("evening")).toBeNull();
  });
});

describe("minutesOfDay", () => {
  it("counts from local midnight", () => {
    expect(minutesOfDay(at(0, 0))).toBe(0);
    expect(minutesOfDay(at(13, 45))).toBe(825);
  });
});

describe("isQuiet", () => {
  it("is never quiet without a window", () => {
    expect(isQuiet(at(3), null)).toBe(false);
  });

  it("handles a window inside one day", () => {
    const window = { start: "09:00", end: "17:00" };
    expect(isQuiet(at(8, 59), window)).toBe(false);
    expect(isQuiet(at(9, 0), window)).toBe(true);
    expect(isQuiet(at(12, 0), window)).toBe(true);
    expect(isQuiet(at(16, 59), window)).toBe(true);
    expect(isQuiet(at(17, 0), window)).toBe(false);
  });

  it("handles a window that crosses midnight", () => {
    const window = { start: "23:00", end: "07:00" };
    expect(isQuiet(at(22, 59), window)).toBe(false);
    expect(isQuiet(at(23, 0), window)).toBe(true);
    expect(isQuiet(at(23, 59), window)).toBe(true);
    expect(isQuiet(at(0, 0), window)).toBe(true);
    expect(isQuiet(at(3, 0), window)).toBe(true);
    expect(isQuiet(at(6, 59), window)).toBe(true);
    expect(isQuiet(at(7, 0), window)).toBe(false);
    expect(isQuiet(at(12, 0), window)).toBe(false);
  });

  it("treats a window with equal ends as empty rather than as the whole day", () => {
    const window = { start: "22:00", end: "22:00" };
    expect(isQuiet(at(22, 0), window)).toBe(false);
    expect(isQuiet(at(3, 0), window)).toBe(false);
  });

  it("is never quiet when the window cannot be parsed", () => {
    expect(isQuiet(at(3), { start: "bedtime", end: "07:00" })).toBe(false);
  });
});
