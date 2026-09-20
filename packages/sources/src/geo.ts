import type { GeoPoint, SearchArea } from "./types.ts";

const EARTH_RADIUS_MILES = 3958.8;

export function haversineMiles(a: GeoPoint, b: GeoPoint): number {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * True when a listing belongs to the search area. A listing with no coordinates passes,
 * because the pipeline geocodes it later and decides then.
 */
export function inArea(area: SearchArea, lat: number | null, lon: number | null): boolean {
  if (lat === null || lon === null) return true;
  return haversineMiles(area.center, { lat, lon }) <= area.radiusMiles;
}

/** Counter-clockwise closed polygon of the bounding box, the shape Redfin's map API expects. */
export function bboxPolygon(area: SearchArea): string {
  const { minLat, minLon, maxLat, maxLon } = area.bbox;
  const points: Array<[number, number]> = [
    [minLon, minLat],
    [maxLon, minLat],
    [maxLon, maxLat],
    [minLon, maxLat],
    [minLon, minLat],
  ];
  return points.map(([lon, lat]) => `${lon} ${lat}`).join(",");
}
