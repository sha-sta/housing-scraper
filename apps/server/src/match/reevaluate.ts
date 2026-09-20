import type { FilterReason, Profile } from "@housing/shared";
import type { Repos } from "../db/repo/index.ts";
import { evaluate } from "./evaluate.ts";
import type { Router } from "./routing.ts";

export interface ReevaluateResult {
  matched: number;
  total: number;
}

/**
 * Re-runs every active listing against one profile. The stored notified_at is untouched, so a
 * profile edit changes what the dashboard shows without re-pushing anything already announced.
 */
export async function reevaluateProfile(
  profile: Profile,
  repos: Repos,
  router: Router,
  now: Date = new Date(),
): Promise<ReevaluateResult> {
  const listings = repos.listings.active();
  let matched = 0;
  for (const listing of listings) {
    const routed = await router.walkMinutes(listing, profile.preferences.location.anchor);
    const match = evaluate(listing, profile, now, routed);
    repos.profiles.saveMatch(match, now.toISOString());
    if (match.matched) matched += 1;
  }
  return { matched, total: listings.length };
}

export interface PreviewResult {
  matched: number;
  total: number;
  topRejectReasons: [FilterReason, number][];
}

/** Answers "what would this profile catch" without writing a single row. */
export function previewProfile(profile: Profile, repos: Repos, now: Date = new Date()): PreviewResult {
  const listings = repos.listings.active();
  const counts = new Map<FilterReason, number>();
  let matched = 0;

  for (const listing of listings) {
    const match = evaluate(listing, profile, now);
    if (match.matched) {
      matched += 1;
      continue;
    }
    for (const reason of match.rejectedBy) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }

  return {
    matched,
    total: listings.length,
    topRejectReasons: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
  };
}
