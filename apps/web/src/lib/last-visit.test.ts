import { beforeEach, describe, expect, it } from "vitest";
import { newSinceIndex, readLastVisit, startVisit, writeLastVisit } from "./last-visit.ts";

const NOW = Date.parse("2026-10-03T22:00:00.000Z");
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

function listing(id: string, minutes: number) {
  return { listing: { id, firstSeenAt: minutesAgo(minutes) } };
}

const none = new Set<string>();

describe("the last visit mark", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("reads back what it wrote", () => {
    writeLastVisit(NOW);
    expect(readLastVisit()).toBe(NOW);
  });

  it("has no mark before the first visit", () => {
    expect(readLastVisit()).toBe(null);
  });

  it("ignores a stored value that is not a moment", () => {
    window.localStorage.setItem("housing.feedLastVisit", "yesterday");
    expect(readLastVisit()).toBe(null);
  });

  it("stamps the new moment and keeps handing back the old one", () => {
    writeLastVisit(NOW);
    const since = startVisit();
    expect(since).toBe(NOW);
    expect(readLastVisit()).toBeGreaterThan(NOW);
    expect(startVisit()).toBe(NOW);
  });
});

describe("the new since divider", () => {
  const items = [listing("a", 2), listing("b", 20), listing("c", 90), listing("d", 400)];

  it("sits above the first listing older than the mark", () => {
    expect(newSinceIndex(items, NOW - 60 * 60_000, none)).toBe(2);
  });

  it("stays away on a first visit", () => {
    expect(newSinceIndex(items, null, none)).toBe(null);
  });

  it("stays away when nothing is new", () => {
    expect(newSinceIndex(items, NOW, none)).toBe(null);
  });

  it("stays away when every listing is new", () => {
    expect(newSinceIndex(items, NOW - 500 * 60_000, none)).toBe(null);
  });

  it("counts a listing that arrived over the stream as new", () => {
    const arrived = new Set(["a", "b"]);
    expect(newSinceIndex(items, NOW, arrived)).toBe(2);
  });

  it("has nothing to divide in an empty feed", () => {
    expect(newSinceIndex([], NOW - 60_000, none)).toBe(null);
  });

  it("ignores a first seen date it cannot read", () => {
    const broken = [{ listing: { id: "x", firstSeenAt: "not a date" } }, listing("y", 1)];
    expect(newSinceIndex(broken, NOW - 60_000, none)).toBe(null);
  });
});
