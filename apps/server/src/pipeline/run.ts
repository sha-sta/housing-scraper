import { RawListingSchema, type Listing, type Match, type Profile } from "@housing/shared";
import type { SourceAdapter, SourceContext } from "@housing/sources";
import type { EventBus } from "../api/events.ts";
import type { Repos, StoredSource } from "../db/repo/index.ts";
import { newId } from "../ids.ts";
import type { Logger } from "../log.ts";
import { evaluate } from "../match/evaluate.ts";
import { reevaluateProfile } from "../match/reevaluate.ts";
import type { Router } from "../match/routing.ts";
import type { Notifier } from "../notify/notifier.ts";
import { buildMatchPush, profileFeedUrl, type PushContext } from "../notify/push.ts";
import type { DraftService } from "../outreach/drafts.ts";
import { findDuplicate, type DedupeCandidate } from "./dedupe.ts";
import type { Geocoder } from "./geocode.ts";
import { normalize, type NormalizedListing } from "./normalize.ts";
import { computeScamSignals, descriptionKey } from "./scam.ts";
import { addressKey } from "./text.ts";

/** Missed successful runs of every source before a listing is called gone. */
export const MISSED_RUNS_BEFORE_GONE = 3;
/** Baseline runs stage this many drafts, highest scores first, so the Drafts screen is useful at once. */
export const BASELINE_DRAFT_CAP = 10;

export interface RunResult {
  returned: number;
  valid: number;
  created: number;
  updated: number;
  gone: number;
  baseline: boolean;
}

/**
 * announce  = a new profile: adopt the stored inventory and say so in one summary push.
 * silent    = an edited profile: adopt it with no push at all, since the owner is on the dashboard.
 * none      = no baseline, the normal push path applies.
 */
export type BaselineMode = "announce" | "silent" | "none";

export interface Pipeline {
  runSource(adapter: SourceAdapter, source: StoredSource, ctx: SourceContext): Promise<RunResult>;
  /** Used when a profile is created or edited. Neither baseline mode pushes per listing. */
  evaluateAll(profile: Profile, mode: BaselineMode): Promise<number>;
}

export interface PipelineOptions {
  repos: Repos;
  bus: EventBus;
  notifier: Notifier;
  drafts: DraftService;
  geocoder: Geocoder;
  router: Router;
  log: Logger;
  pushContext(): PushContext;
}

interface Processed {
  listing: Listing;
  isNew: boolean;
  priceDropped: boolean;
  backOnMarket: boolean;
}

function toCandidate(listing: Listing, key: string | null): DedupeCandidate {
  return {
    id: listing.id,
    addressKey: key,
    lat: listing.lat,
    lon: listing.lon,
    beds: listing.beds,
    bedsMax: listing.bedsMax,
    price: listing.price,
  };
}

export function createPipeline(options: PipelineOptions): Pipeline {
  const { repos, bus, notifier, drafts, geocoder, router, log } = options;

  async function walkMinutesFor(listing: Listing, profile: Profile): Promise<number | null> {
    return router.walkMinutes(listing, profile.preferences.location.anchor);
  }

  async function evaluateInto(listing: Listing, profiles: Profile[], now: Date): Promise<Map<string, Match>> {
    const byProfile = new Map<string, Match>();
    for (const profile of profiles) {
      const routed = await walkMinutesFor(listing, profile);
      const match = evaluate(listing, profile, now, routed);
      repos.profiles.saveMatch(match, now.toISOString());
      byProfile.set(profile.id, match);
    }
    return byProfile;
  }

  /** Staging has to happen before the push, because the push carries the draft's actions. */
  async function stageIfWanted(listing: Listing, profile: Profile, score: number) {
    const outreach = profile.preferences.outreach;
    if (!outreach.autoDraft || score < outreach.minScore) return null;
    return drafts.stage(listing, profile);
  }

  async function pushMatch(listing: Listing, match: Match, profile: Profile, now: Date): Promise<void> {
    const draft = await stageIfWanted(listing, profile, match.score);
    const push = buildMatchPush(listing, match, profile, draft, options.pushContext());
    await notifier.deliver({
      kind: "match",
      profile,
      listingId: listing.id,
      title: push.title,
      body: push.body,
      click: push.click,
      attach: push.attach ?? null,
      priority: push.priority,
      tags: push.tags,
      actions: push.actions,
      shareActions: push.shareActions,
      score: match.score,
    });
    repos.profiles.markNotified(listing.id, profile.id, now.toISOString());
  }

  async function pushEvent(
    kind: "priceDrop" | "backOnMarket",
    listing: Listing,
    match: Match,
    profile: Profile,
  ): Promise<void> {
    const context = options.pushContext();
    const title =
      kind === "priceDrop"
        ? `Price drop: ${listing.address ?? listing.title}`
        : `Back on the market: ${listing.address ?? listing.title}`;
    const previous = listing.priceHistory.at(-2)?.price ?? null;
    const body =
      kind === "priceDrop" && previous !== null && listing.price !== null
        ? `Now $${Math.round(listing.price).toLocaleString("en-US")}, was $${Math.round(previous).toLocaleString("en-US")}`
        : `Score ${Math.round(match.score)}`;

    await notifier.deliver({
      kind,
      profile,
      listingId: listing.id,
      title,
      body,
      click: `${context.dashboardUrl.replace(/\/+$/, "")}/listings/${listing.id}`,
      attach: listing.photos[0] ?? null,
      priority: 4,
      tags: [kind === "priceDrop" ? "chart_with_downwards_trend" : "recycle"],
      actions: [{ action: "view", label: "Open listing", url: listing.sources[0]?.url ?? context.dashboardUrl }],
      shareActions: [{ action: "view", label: "Open listing", url: listing.sources[0]?.url ?? context.dashboardUrl }],
      score: match.score,
    });
  }

  async function sendBaselineSummary(profile: Profile, count: number): Promise<void> {
    const settings = repos.config.getSettings();
    const dashboardUrl = settings?.dashboardUrl ?? options.pushContext().dashboardUrl;
    await notifier.deliver({
      kind: "digest",
      profile,
      listingId: null,
      title: "Baseline ready",
      body: `${count} current ${count === 1 ? "listing matches" : "listings match"} ${profile.name}. New ones will arrive as they appear.`,
      click: profileFeedUrl(dashboardUrl, profile.id),
      priority: 3,
      tags: ["house"],
      alwaysSend: true,
    });
  }

  /**
   * Stores and evaluates everything without pushing per listing. One summary goes out per profile,
   * the best few drafts are staged, and every match is marked notified so it never pushes later.
   */
  async function settleBaseline(profiles: Profile[], announce: boolean): Promise<void> {
    const now = new Date().toISOString();
    for (const profile of profiles) {
      const pending = repos.profiles.unnotifiedMatches(profile.id, 0);
      const worthPushing = pending.filter((m) => m.score >= profile.preferences.notify.minScore);

      const draftable = [...worthPushing]
        .sort((a, b) => b.score - a.score)
        .slice(0, BASELINE_DRAFT_CAP);
      for (const match of draftable) {
        const listing = repos.listings.get(match.listingId);
        if (listing === null) continue;
        await stageIfWanted(listing, profile, match.score);
      }

      repos.profiles.markManyNotified(profile.id, pending.map((m) => m.listingId), now);
      if (announce && worthPushing.length > 0) await sendBaselineSummary(profile, worthPushing.length);
    }
  }

  async function upsert(normalized: NormalizedListing, now: Date): Promise<Processed> {
    const seenAt = now.toISOString();
    const existingLink = repos.listings.findBySourceKey(normalized.sourceId, normalized.sourceListingId);

    const active = repos.listings.active();
    const candidates = active.map((l) => toCandidate(l, addressKey(l.address)));
    const sameText = descriptionKey(normalized.description);
    const textElsewhere =
      sameText === null
        ? false
        : active.some(
            (l) => descriptionKey(l.description) === sameText && addressKey(l.address) !== normalized.addressKey,
          );

    const comparablePrices = active
      .filter((l) => l.beds === normalized.beds && l.price !== null && l.id !== existingLink?.listingId)
      .map((l) => l.price ?? 0);

    const scamSignals = computeScamSignals(
      {
        price: normalized.price,
        address: normalized.address,
        photos: normalized.photos,
        text: [normalized.title, normalized.description ?? ""].join("\n"),
      },
      { comparablePrices, textSeenAtAnotherAddress: textElsewhere },
    );

    const fields = {
      title: normalized.title,
      description: normalized.description,
      price: normalized.price,
      priceMax: normalized.priceMax,
      beds: normalized.beds,
      bedsMax: normalized.bedsMax,
      baths: normalized.baths,
      sqft: normalized.sqft,
      propertyType: normalized.propertyType,
      isSublet: normalized.isSublet,
      incomeRestricted: normalized.incomeRestricted,
      seniorHousing: normalized.seniorHousing,
      address: normalized.address,
      neighborhood: normalized.neighborhood,
      zip: normalized.zip,
      lat: normalized.lat,
      lon: normalized.lon,
      availableDate: normalized.availableDate,
      leaseMonths: normalized.leaseMonths,
      photos: normalized.photos,
      amenities: normalized.amenities,
      contact: normalized.contact,
      scamSignals,
      postedAt: normalized.postedAt,
    };

    if (existingLink !== null) {
      const stored = repos.listings.get(existingLink.listingId);
      if (stored !== null) {
        const priceDropped = stored.price !== null && fields.price !== null && fields.price < stored.price;
        const priceChanged = stored.price !== fields.price;
        const backOnMarket = stored.status === "gone";
        const updated: Listing = {
          ...stored,
          ...fields,
          priceHistory:
            priceChanged && fields.price !== null
              ? [...stored.priceHistory, { price: fields.price, at: seenAt }]
              : stored.priceHistory,
          status: "active",
          lastSeenAt: seenAt,
        };
        repos.listings.update(updated);
        repos.listings.touchSourceRow(existingLink.id, seenAt);
        return { listing: updated, isNew: false, priceDropped, backOnMarket };
      }
    }

    const duplicate = findDuplicate(
      {
        id: "",
        addressKey: normalized.addressKey,
        lat: normalized.lat,
        lon: normalized.lon,
        beds: normalized.beds,
        bedsMax: normalized.bedsMax,
        price: normalized.price,
      },
      candidates,
    );

    if (duplicate !== null) {
      const stored = repos.listings.get(duplicate.id);
      if (stored !== null) {
        // The same unit on a second site: one listing, two source rows.
        const merged: Listing = {
          ...stored,
          photos: stored.photos.length === 0 ? fields.photos : stored.photos,
          description: stored.description ?? fields.description,
          contact: {
            name: stored.contact.name ?? fields.contact.name,
            company: stored.contact.company ?? fields.contact.company,
            email: stored.contact.email ?? fields.contact.email,
            phone: stored.contact.phone ?? fields.contact.phone,
            formUrl: stored.contact.formUrl ?? fields.contact.formUrl,
          },
          status: "active",
          lastSeenAt: seenAt,
        };
        repos.listings.update(merged);
        repos.listings.addSourceRow({
          id: newId("lsr"),
          listingId: stored.id,
          sourceId: normalized.sourceId,
          sourceListingId: normalized.sourceListingId,
          url: normalized.url,
          isPrimary: false,
          missedRuns: 0,
          lastSeenAt: seenAt,
        });
        return { listing: repos.listings.get(stored.id) ?? merged, isNew: false, priceDropped: false, backOnMarket: false };
      }
    }

    const listing: Listing = {
      id: newId("lst"),
      ...fields,
      sources: [],
      priceHistory: fields.price === null ? [] : [{ price: fields.price, at: seenAt }],
      status: "active",
      firstSeenAt: seenAt,
      lastSeenAt: seenAt,
    };
    repos.listings.insert(listing);
    repos.listings.addSourceRow({
      id: newId("lsr"),
      listingId: listing.id,
      sourceId: normalized.sourceId,
      sourceListingId: normalized.sourceListingId,
      url: normalized.url,
      isPrimary: true,
      missedRuns: 0,
      lastSeenAt: seenAt,
    });
    return { listing: repos.listings.get(listing.id) ?? listing, isNew: true, priceDropped: false, backOnMarket: false };
  }

  return {
    async runSource(adapter, source, ctx) {
      const now = new Date();
      const isBaseline = source.baselineAt === null;

      // 1. Ask the adapter.
      const returned = await adapter.search(ctx);

      // 2. Validate, dropping anything that does not fit the contract.
      const valid = [];
      for (const item of returned) {
        const parsed = RawListingSchema.safeParse(item);
        if (!parsed.success) {
          log.warn("dropped an invalid raw listing", { sourceId: source.id, error: parsed.error.message });
          continue;
        }
        valid.push(parsed.data);
      }

      // 3. Enrich the ones we have never seen.
      const known = repos.listings.knownSourceListingIds(source.id);
      const enriched = [];
      for (const item of valid) {
        if (adapter.enrich === undefined || known.has(item.sourceListingId)) {
          enriched.push(item);
          continue;
        }
        const detail = await adapter.enrich(item, ctx);
        const parsed = RawListingSchema.safeParse(detail);
        enriched.push(parsed.success ? parsed.data : item);
      }

      const profiles = repos.profiles.enabled();
      const processed: Processed[] = [];
      const seenKeys: string[] = [];

      for (const item of enriched) {
        // 4. Normalize.
        const normalized = normalize(item, now);

        // 5. Geocode only what the source left blank.
        if (normalized.lat === null || normalized.lon === null) {
          const point = await geocoder.lookup(normalized.address, normalized.addressKey);
          if (point !== null) {
            normalized.lat = point.lat;
            normalized.lon = point.lon;
          }
        }

        // 6, 7, 8. Dedupe, scam signals, upsert.
        const result = await upsert(normalized, now);
        processed.push(result);
        seenKeys.push(normalized.sourceListingId);

        // 9. Evaluate against every enabled profile.
        const byProfile = await evaluateInto(result.listing, profiles, now);

        // 11. Tell the dashboard, whatever happens with the pushes.
        bus.publish({ type: "listing.upserted", listingId: result.listing.id, isNew: result.isNew });

        if (isBaseline) continue;

        // 10. Push what is new to this profile, and the two events that reopen an old match.
        for (const profile of profiles) {
          const match = byProfile.get(profile.id);
          if (match === undefined || !match.matched) continue;
          const stored = repos.profiles.getMatch(result.listing.id, profile.id);
          const alreadyNotified = stored?.notifiedAt !== null && stored?.notifiedAt !== undefined;
          const notify = profile.preferences.notify;

          if (!alreadyNotified && match.score >= notify.minScore) {
            await pushMatch(result.listing, match, profile, now);
            continue;
          }
          if (alreadyNotified && result.priceDropped && notify.priceDrops) {
            await pushEvent("priceDrop", result.listing, match, profile);
          }
          if (alreadyNotified && result.backOnMarket && notify.backOnMarket) {
            await pushEvent("backOnMarket", result.listing, match, profile);
          }
        }
      }

      // 8 continued. Anything this source stopped listing gets one more strike.
      repos.listings.markMissed(source.id, seenKeys);
      const goneIds = repos.listings
        .listingsMissedEverywhere(MISSED_RUNS_BEFORE_GONE)
        .filter((id) => repos.listings.get(id)?.status === "active");
      repos.listings.setStatus(goneIds, "gone");
      for (const id of goneIds) bus.publish({ type: "listing.upserted", listingId: id, isNew: false });

      if (isBaseline) await settleBaseline(profiles, true);

      return {
        returned: returned.length,
        valid: valid.length,
        created: processed.filter((p) => p.isNew).length,
        updated: processed.filter((p) => !p.isNew).length,
        gone: goneIds.length,
        baseline: isBaseline,
      };
    },

    async evaluateAll(profile, mode) {
      const result = await reevaluateProfile(profile, repos, router);
      if (mode !== "none") await settleBaseline([profile], mode === "announce");
      bus.publish({ type: "profiles.changed" });
      return result.matched;
    },
  };
}
