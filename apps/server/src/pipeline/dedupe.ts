import { haversineMiles } from "../match/geo.ts";

/** 40 metres, the spec's threshold for "the same building" when addresses are written differently. */
export const SAME_UNIT_MILES = 40 / 1609.344;

export interface DedupeCandidate {
  id: string;
  addressKey: string | null;
  lat: number | null;
  lon: number | null;
  beds: number | null;
  /** Set when the row stands for a building with several floor plans rather than one unit. */
  bedsMax: number | null;
  price: number | null;
}

/** A building with a floor plan range is never the same record as one unit at that address. */
function sameShape(a: DedupeCandidate, b: DedupeCandidate): boolean {
  return (a.bedsMax === null) === (b.bedsMax === null);
}

function closeEnough(a: DedupeCandidate, b: DedupeCandidate): boolean {
  if (a.lat === null || a.lon === null || b.lat === null || b.lon === null) return false;
  return haversineMiles({ lat: a.lat, lon: a.lon }, { lat: b.lat, lon: b.lon }) <= SAME_UNIT_MILES;
}

/**
 * The same unit posted twice. Either the normalized addresses agree, unit number included, or the
 * two sit on top of each other and agree on the two facts a landlord never varies between posts.
 */
export function findDuplicate(candidate: DedupeCandidate, existing: DedupeCandidate[]): DedupeCandidate | null {
  for (const other of existing) {
    if (other.id === candidate.id) continue;
    if (candidate.addressKey !== null && candidate.addressKey === other.addressKey && sameShape(candidate, other)) {
      return other;
    }
  }
  for (const other of existing) {
    if (other.id === candidate.id) continue;
    if (!closeEnough(candidate, other)) continue;
    if (!sameShape(candidate, other)) continue;
    if (candidate.beds !== other.beds) continue;
    if (candidate.price !== other.price) continue;
    return other;
  }
  return null;
}
