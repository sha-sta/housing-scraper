import type { Listing } from "@housing/shared";
import type { Repos } from "./db/repo/index.ts";
import { evaluate, wholeUnitRent } from "./match/evaluate.ts";
import { comparableRents } from "./pipeline/run.ts";
import { computeScamSignals, descriptionKey } from "./pipeline/scam.ts";
import { addressKey, inferPriceBasis } from "./pipeline/text.ts";

/**
 * Brings stored rows up to the current rules. A database written before price basis existed holds
 * per-room prices read as whole-unit rents, and scam signals raised against managed feeds that were
 * never going to publish an address. Both make the dashboard lie, so both are recomputed on boot.
 *
 * Nothing here notifies. Matches are rewritten in place and keep whatever notified_at they had, so
 * a repair can never turn into a hundred pushes.
 */
export function repairListings(repos: Repos, peerPosted: (sourceId: string) => boolean): number {
  const active = repos.listings.active();
  if (active.length === 0) return 0;

  const repaired: Listing[] = [];
  for (const listing of active) {
    const text = [listing.title, listing.description ?? ""].join("\n");
    const priceBasis = inferPriceBasis(text, listing.beds, listing.price);
    const candidate: Listing = { ...listing, priceBasis };

    const key = addressKey(listing.address);
    const sameText = descriptionKey(listing.description);
    const textElsewhere =
      sameText === null
        ? false
        : active.some(
            (other) =>
              other.id !== listing.id &&
              descriptionKey(other.description) === sameText &&
              addressKey(other.address) !== key,
          );

    const scamSignals = computeScamSignals(
      {
        monthlyTotal: wholeUnitRent(candidate),
        address: listing.address,
        photos: listing.photos,
        text,
        peerPosted: peerPosted(listing.sources[0]?.sourceId ?? ""),
      },
      {
        comparablePrices: comparableRents(active, listing.beds, listing.id),
        textSeenAtAnotherAddress: textElsewhere,
      },
    );

    const changed =
      listing.priceBasis !== priceBasis ||
      listing.scamSignals.length !== scamSignals.length ||
      listing.scamSignals.some((signal, index) => scamSignals[index] !== signal);

    const updated: Listing = { ...candidate, scamSignals };
    if (changed) repos.listings.update(updated);
    repaired.push(updated);
  }

  const now = new Date();
  for (const profile of repos.profiles.enabled()) {
    for (const listing of repaired) {
      repos.profiles.saveMatch(evaluate(listing, profile, now), now.toISOString());
    }
  }
  return repaired.length;
}
