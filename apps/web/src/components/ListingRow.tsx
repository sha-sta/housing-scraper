import { Link } from "react-router";
import type { ListingView, Match, Profile } from "@housing/shared";
import {
  formatBaths,
  formatBedRange,
  formatDate,
  headlinePrice,
  formatPerPerson,
  formatWalk,
  relativeTime,
  shortAddress,
  sourceLabel,
} from "../lib/format.ts";
import { rejectSummary } from "../lib/reasons.ts";
import { stageColor, stageLabel } from "../lib/stage.ts";
import { Chip, ScorePlate } from "./ui.tsx";
import { IconHide, IconShow, IconStar } from "./icons.tsx";

export function pickMatch(view: ListingView, profileId: string | null): Match | null {
  if (profileId) {
    const exact = view.matches.find((m) => m.profileId === profileId);
    if (exact) return exact;
  }
  return [...view.matches].sort((a, b) => b.score - a.score)[0] ?? null;
}

function Photo({ url, alt, dim }: { url: string | undefined; alt: string; dim: boolean }) {
  if (!url) {
    return (
      <span
        aria-hidden="true"
        className="flex h-[84px] w-[64px] shrink-0 items-center justify-center rounded-[var(--radius-photo)] bg-surface-2 text-[11px] text-ink-3"
      >
        No photo
      </span>
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      className={`h-[84px] w-[64px] shrink-0 rounded-[var(--radius-photo)] bg-surface-2 object-cover ${dim ? "opacity-55" : ""}`}
    />
  );
}

export function ListingRow({
  view,
  profile,
  profileId,
  arrived,
  showRestrictions,
  onStar,
  onHide,
}: {
  view: ListingView;
  profile: Profile | null;
  profileId: string | null;
  arrived: boolean;
  showRestrictions: boolean;
  onStar: (starred: boolean) => void;
  onHide: (hidden: boolean) => void;
}) {
  const { listing, state } = view;
  const match = pickMatch(view, profileId);
  const rejected = match !== null && !match.matched;
  const spine = profile?.color ?? "var(--rule-strong)";
  const price = headlinePrice(
    listing.price,
    listing.priceMax,
    listing.priceBasis,
    match?.monthlyTotal ?? null,
  );

  return (
    <article
      className={`relative bg-surface ${arrived ? "arrived" : ""}`}
      data-testid="listing-row"
      data-listing-id={listing.id}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: spine }}
      />
      {listing.scamSignals.length > 0 ? (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-[2px]"
          style={{ background: "var(--brick)" }}
        />
      ) : null}

      <div className="flex gap-3 py-3 pl-4 pr-3">
        <div className="shrink-0 pt-0.5">
          {match ? (
            <ScorePlate score={match.score} />
          ) : (
            <span
              className="block h-[29px] w-[42px] rounded-[3px] bg-surface-2"
              aria-label="Not scored for any profile"
            />
          )}
        </div>

        <Photo url={listing.photos[0]} alt="" dim={rejected || listing.status === "gone"} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="num cond text-[19px] leading-none">{price.headline}</span>
            <span className="num text-[12.5px] text-ink-2">
              {formatPerPerson(match?.pricePerPerson ?? null)}
            </span>
            {price.perRoom ? (
              <span className="num text-[11.5px] text-ink-3">{price.perRoom}</span>
            ) : null}
          </div>

          <p className="num mt-1.5 flex flex-wrap gap-x-3 text-[12.5px] text-ink-2">
            <span>{formatBedRange(listing.beds, listing.bedsMax)}</span>
            <span>{formatBaths(listing.baths)}</span>
            <span>{formatWalk(match?.walkMinutes ?? null)}</span>
          </p>

          <h3 className="med mt-1 truncate text-[14px]">
            <Link
              to={`/listings/${listing.id}`}
              className="after:absolute after:inset-0 after:content-['']"
            >
              {listing.address ? shortAddress(listing.address) : listing.title}
            </Link>
          </h3>

          {rejected && match ? (
            <p className="mt-1 text-[12.5px] text-brick">{rejectSummary(match.rejectedBy)}</p>
          ) : null}

          <div className="mt-2 flex items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              <Chip tone="quiet">{sourceLabel(listing.sources[0]?.sourceId ?? "unknown")}</Chip>
              {listing.sources.length > 1 ? (
                <Chip tone="quiet">{`+${listing.sources.length - 1} more`}</Chip>
              ) : null}
              {listing.availableDate ? (
                <span className="num text-[11.5px] text-ink-2">
                  from {formatDate(listing.availableDate)}
                </span>
              ) : null}
              <span className="num text-[11.5px] text-ink-3">
                {relativeTime(listing.firstSeenAt)}
              </span>
              {listing.scamSignals.length > 0 ? <Chip tone="brick">Possible scam</Chip> : null}
              {listing.status === "gone" ? <Chip tone="quiet">Off the market</Chip> : null}
              {showRestrictions && listing.incomeRestricted ? (
                <Chip tone="quiet">Income restricted</Chip>
              ) : null}
              {showRestrictions && listing.seniorHousing ? (
                <Chip tone="quiet">Senior housing</Chip>
              ) : null}
              {state.stage !== "new" ? (
                <Chip tone="plain">
                  <span
                    aria-hidden="true"
                    className="h-[6px] w-[6px] rounded-full"
                    style={{ background: stageColor(state.stage) }}
                  />
                  {stageLabel(state.stage)}
                </Chip>
              ) : null}
            </div>

            <div className="relative z-10 flex shrink-0 items-center">
              <button
                type="button"
                onClick={() => onStar(!state.starred)}
                aria-pressed={state.starred}
                aria-label={state.starred ? "Remove star" : "Star this listing"}
                className={`tap flex items-center justify-center ${state.starred ? "text-moss" : "text-ink-3 hover:text-ink-2"}`}
              >
                <IconStar filled={state.starred} />
              </button>
              <button
                type="button"
                onClick={() => onHide(!state.hidden)}
                aria-pressed={state.hidden}
                aria-label={state.hidden ? "Unhide this listing" : "Hide this listing"}
                className="tap flex items-center justify-center text-ink-3 hover:text-ink-2"
              >
                {state.hidden ? <IconShow /> : <IconHide />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
