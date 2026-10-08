import { describe, expect, it } from "vitest";
import { isApplePlatform, walkingDirectionsUrl } from "./directions.ts";

const anchor = { lat: 39.3289, lon: -76.6205 };
const listing = { lat: 39.3252, lon: -76.6156 };

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1";
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";

describe("spotting an Apple device", () => {
  it("knows the Apple platforms", () => {
    expect(isApplePlatform({ platform: "iPhone", userAgent: IPHONE })).toBe(true);
    expect(isApplePlatform({ platform: "iPad", userAgent: IPHONE })).toBe(true);
    expect(isApplePlatform({ platform: "MacIntel", userAgent: MAC })).toBe(true);
    expect(isApplePlatform({ userAgent: MAC })).toBe(true);
  });

  it("knows everything else", () => {
    expect(isApplePlatform({ platform: "Win32", userAgent: WINDOWS })).toBe(false);
    expect(isApplePlatform({ platform: "Linux x86_64", userAgent: ANDROID })).toBe(false);
    expect(isApplePlatform({ platform: "Linux x86_64" })).toBe(false);
    expect(isApplePlatform({})).toBe(false);
  });

  it("reads an Android phone as Android, not as a Mac build string", () => {
    expect(isApplePlatform({ platform: "Linux armv8l", userAgent: ANDROID })).toBe(false);
  });
});

describe("walking directions", () => {
  it("sends an Apple device to Maps", () => {
    expect(walkingDirectionsUrl(anchor, listing, { platform: "MacIntel" })).toBe(
      "https://maps.apple.com/?saddr=39.3289,-76.6205&daddr=39.3252,-76.6156&dirflg=w",
    );
  });

  it("sends everything else to Google Maps on foot", () => {
    expect(walkingDirectionsUrl(anchor, listing, { platform: "Win32" })).toBe(
      "https://www.google.com/maps/dir/?api=1&origin=39.3289,-76.6205&destination=39.3252,-76.6156&travelmode=walking",
    );
  });
});
