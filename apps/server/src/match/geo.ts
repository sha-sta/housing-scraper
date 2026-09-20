import type { Anchor } from "@housing/shared";

export const WALK_MPH = 3;
/** Streets are not straight lines. The spec's fallback multiplies the crow-flies distance by this. */
export const STREET_FACTOR = 1.3;

const EARTH_RADIUS_MILES = 3958.7613;

export interface Point {
  lat: number;
  lon: number;
}

export function haversineMiles(a: Point, b: Point): number {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const lat1 = a.lat * toRad;
  const lat2 = b.lat * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function walkMinutesForMiles(straightLineMiles: number): number {
  return (straightLineMiles * STREET_FACTOR) / WALK_MPH * 60;
}

export function milesForWalkMinutes(minutes: number): number {
  return (minutes / 60) * WALK_MPH / STREET_FACTOR;
}

export function anchorPoint(anchor: Anchor): Point {
  return { lat: anchor.lat, lon: anchor.lon };
}
