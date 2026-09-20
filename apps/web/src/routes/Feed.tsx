import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import type { ListingQuery, Stage } from "@housing/shared";
import { STAGES } from "@housing/shared";
import { ListingRow } from "../components/ListingRow.tsx";
import { Empty, ErrorNote, Spinner } from "../components/ui.tsx";
import { IconSearch } from "../components/icons.tsx";
import { useLive } from "../lib/live.tsx";
import { useListings, useListingState, useSources } from "../lib/queries.ts";
import { useSelection } from "../lib/selection.tsx";
import { sourceLabel, pluralize } from "../lib/format.ts";
import { stageLabel } from "../lib/stage.ts";

const SORTS: { value: ListingQuery["sort"]; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "score", label: "Best score" },
  { value: "priceAsc", label: "Cheapest" },
  { value: "priceDesc", label: "Priciest" },
  { value: "distance", label: "Closest" },
];

function isSort(value: string | null): value is ListingQuery["sort"] {
  return SORTS.some((s) => s.value === value);
}

function isStage(value: string | null): value is Stage {
  return value !== null && (STAGES as readonly string[]).includes(value);
}

export function ProfileSwitcher() {
  const { profiles, profileId, select } = useSelection();
  if (profiles.length === 0) return null;
  return (
    <div className="scroll-x flex items-center gap-2 px-4 pb-1 lg:px-6" role="tablist" aria-label="Profiles">
      {profiles.map((profile) => {
        const active = profile.id === profileId;
        return (
          <button
            key={profile.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => select(profile.id)}
            className={`flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border px-3 text-[13.5px] ${
              active ? "semi border-transparent bg-moss-soft text-ink" : "border-rule text-ink-2"
            }`}
          >
            <span
              aria-hidden="true"
              className="h-[9px] w-[9px] rounded-full"
              style={{ background: profile.color, opacity: profile.enabled ? 1 : 0.35 }}
            />
            {profile.name}
            {profile.enabled ? null : <span className="text-[11.5px] text-ink-3">off</span>}
          </button>
        );
      })}
      <Link
        to="/settings"
        className="flex min-h-[44px] shrink-0 items-center rounded-full border border-dashed border-rule-strong px-3 text-[13.5px] text-ink-2"
      >
        Edit profiles
      </Link>
    </div>
  );
}

export function Feed() {
  const [params, setParams] = useSearchParams();
  const { profileId, profile, profiles } = useSelection();
  const { arrivals, clearArrivals } = useLive();
  const { data: sources } = useSources();
  const listingState = useListingState();
  const [limit, setLimit] = useState(50);
  const topRef = useRef<HTMLDivElement | null>(null);

  const scope = params.get("scope") === "all" ? "all" : "matched";
  const sortParam = params.get("sort");
  const sort: ListingQuery["sort"] = isSort(sortParam) ? sortParam : "newest";
  const stageParam = params.get("stage");
  const stage = isStage(stageParam) ? stageParam : undefined;
  const starred = params.get("starred") === "true";
  const sourceId = params.get("source") ?? undefined;
  const text = params.get("q") ?? "";

  const [draftText, setDraftText] = useState(text);
  useEffect(() => setDraftText(text), [text]);
  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (draftText === text) return;
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (draftText) next.set("q", draftText);
          else next.delete("q");
          return next;
        },
        { replace: true },
      );
    }, 250);
    return () => window.clearTimeout(handle);
  }, [draftText, text, setParams]);

  const query = useMemo<Partial<ListingQuery>>(
    () => ({
      profileId: profileId ?? undefined,
      scope,
      sort,
      stage,
      starred: starred || undefined,
      includeHidden: scope === "all",
      includeGone: scope === "all",
      sourceId,
      q: text || undefined,
      limit,
    }),
    [profileId, scope, sort, stage, starred, sourceId, text, limit],
  );

  const listings = useListings(query);
  const items = listings.data?.items ?? [];
  const total = listings.data?.total ?? 0;
  const arrivalSet = useMemo(() => new Set(arrivals), [arrivals]);
  const unseen = arrivals.filter((id) => items.some((item) => item.listing.id === id)).length;

  function update(key: string, value: string | null) {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value === null) next.delete(key);
      else next.set(key, value);
      return next;
    });
    setLimit(50);
  }

  const filtered = Boolean(stage || starred || sourceId || text);

  return (
    <div>
      <div ref={topRef} />
      <div className="sticky top-12 z-20 border-b border-rule bg-ground/95 pt-3 backdrop-blur lg:top-0 lg:pt-5">
        <div className="flex items-baseline justify-between gap-3 px-4 pb-2.5 lg:px-6">
          <h1 className="wide text-[19px] leading-none lg:text-[22px]">Feed</h1>
          <span className="num text-[12.5px] text-ink-2">
            {listings.isPending ? "loading" : pluralize(total, "listing", "listings")}
          </span>
        </div>

        <ProfileSwitcher />

        <div className="scroll-x mt-2 flex items-center gap-2 px-4 pb-3 lg:px-6">
          <label className="sr-only" htmlFor="feed-sort">
            Sort
          </label>
          <select
            id="feed-sort"
            className="field w-auto min-w-[124px] shrink-0 text-[13.5px]"
            value={sort}
            onChange={(e) => update("sort", e.currentTarget.value)}
          >
            {SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <label className="sr-only" htmlFor="feed-stage">
            Filter by stage
          </label>
          <select
            id="feed-stage"
            className="field w-auto min-w-[112px] shrink-0 text-[13.5px]"
            value={stage ?? ""}
            onChange={(e) => update("stage", e.currentTarget.value || null)}
          >
            <option value="">Any stage</option>
            {STAGES.map((value) => (
              <option key={value} value={value}>
                {stageLabel(value)}
              </option>
            ))}
          </select>

          <label className="sr-only" htmlFor="feed-source">
            Filter by source
          </label>
          <select
            id="feed-source"
            className="field w-auto min-w-[116px] shrink-0 text-[13.5px]"
            value={sourceId ?? ""}
            onChange={(e) => update("source", e.currentTarget.value || null)}
          >
            <option value="">Any source</option>
            {(sources ?? []).map((source) => (
              <option key={source.id} value={source.id}>
                {sourceLabel(source.id)}
              </option>
            ))}
          </select>

          <button
            type="button"
            aria-pressed={starred}
            onClick={() => update("starred", starred ? null : "true")}
            className={`ctl shrink-0 text-[13.5px] ${starred ? "semi border-transparent bg-moss-soft" : ""}`}
          >
            Starred
          </button>

          <button
            type="button"
            aria-pressed={scope === "all"}
            onClick={() => update("scope", scope === "all" ? null : "all")}
            className={`ctl shrink-0 whitespace-nowrap text-[13.5px] ${scope === "all" ? "semi border-transparent bg-moss-soft" : ""}`}
          >
            Show everything scraped
          </button>
        </div>

        <div className="px-4 pb-3 lg:px-6">
          <div className="relative">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-ink-3" />
            <input
              type="search"
              className="field pl-9 text-[14px]"
              placeholder="Search address, title, description"
              aria-label="Search listings"
              value={draftText}
              onChange={(e) => setDraftText(e.currentTarget.value)}
            />
          </div>
        </div>
      </div>

      {unseen > 0 ? (
        <button
          type="button"
          onClick={() => {
            topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            clearArrivals();
          }}
          className="med sticky top-[210px] z-10 mx-4 mt-3 flex min-h-[40px] w-[calc(100%-32px)] items-center justify-center rounded-full bg-moss px-4 text-[13px] text-moss-ink lg:mx-6 lg:w-auto"
        >
          {pluralize(unseen, "new listing", "new listings")} since you opened
        </button>
      ) : null}

      {listings.isError ? <ErrorNote error={listings.error} /> : null}

      {listings.isPending ? <Spinner label="Loading listings" /> : null}

      {!listings.isPending && items.length === 0 ? (
        profiles.length === 0 ? (
          <Empty
            title="No profiles yet"
            next="A profile is the search you want watched. Make one and the feed fills as sources run."
            action={
              <Link to="/settings" className="ctl-primary med flex items-center px-4 text-[14px]">
                Create a profile
              </Link>
            }
          />
        ) : filtered ? (
          <Empty
            title="No listings match these filters"
            next="Clear a filter or switch profiles. The counts at the top tell you how much is behind them."
            action={
              <button type="button" className="ctl med text-[14px]" onClick={() => setParams({})}>
                Clear filters
              </button>
            }
          />
        ) : scope === "all" ? (
          <Empty
            title="Nothing scraped yet"
            next="No source has returned a listing. Open Sources to run one now and see the error if it fails."
            action={
              <Link to="/sources" className="ctl med flex items-center px-4 text-[14px]">
                Open Sources
              </Link>
            }
          />
        ) : (
          <Empty
            title={`Nothing matches ${profile?.name ?? "this profile"} yet`}
            next="Turn on Show everything scraped to see what was rejected and why, or loosen the profile."
            action={
              <button
                type="button"
                className="ctl med text-[14px]"
                onClick={() => update("scope", "all")}
              >
                Show everything scraped
              </button>
            }
          />
        )
      ) : null}

      <div className="row-stack border-t border-rule">
        {items.map((view) => (
          <ListingRow
            key={view.listing.id}
            view={view}
            profile={profile}
            profileId={profileId}
            arrived={arrivalSet.has(view.listing.id)}
            showRestrictions={scope === "all"}
            onStar={(value) =>
              listingState.mutate({ id: view.listing.id, patch: { starred: value } })
            }
            onHide={(value) =>
              listingState.mutate({ id: view.listing.id, patch: { hidden: value } })
            }
          />
        ))}
      </div>

      {items.length > 0 && items.length < total ? (
        <div className="flex justify-center px-4 py-5">
          <button
            type="button"
            className="ctl med text-[14px]"
            onClick={() => setLimit((value) => Math.min(200, value + 50))}
          >
            Show more
          </button>
        </div>
      ) : null}
    </div>
  );
}
