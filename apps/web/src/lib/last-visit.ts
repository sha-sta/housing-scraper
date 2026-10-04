import { useState } from "react";

const STORAGE_KEY = "housing.feedLastVisit";

/** The moment the feed was last opened, or null on the first ever visit. */
export function readLastVisit(): number | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function writeLastVisit(at: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(at));
  } catch {
    // A browser with storage blocked still works. It just marks nothing as new.
  }
}

/**
 * One mark per page load, held in the module so StrictMode's second render and a
 * remount on the way back from a listing both see the same moment. Reading and
 * stamping together is what makes the divider last the visit and go on the next one.
 */
let visit: { since: number | null } | null = null;

export function startVisit(): number | null {
  if (visit === null) {
    visit = { since: readLastVisit() };
    writeLastVisit(Date.now());
  }
  return visit.since;
}

export function useLastVisit(): number | null {
  const [since] = useState(startVisit);
  return since;
}

/**
 * Where the "new since you last looked" divider goes, which is above the first listing
 * older than the mark. Null when the whole page is new, when none of it is, or on a
 * first visit with no mark to compare against.
 */
export function newSinceIndex(
  items: readonly { listing: { id: string; firstSeenAt: string } }[],
  since: number | null,
  arrivals: ReadonlySet<string>,
): number | null {
  if (since === null) return null;
  const isNew = (item: { listing: { id: string; firstSeenAt: string } }) => {
    if (arrivals.has(item.listing.id)) return true;
    const seen = Date.parse(item.listing.firstSeenAt);
    return Number.isFinite(seen) && seen > since;
  };
  const firstOlder = items.findIndex((item) => !isNew(item));
  return firstOlder > 0 ? firstOlder : null;
}
