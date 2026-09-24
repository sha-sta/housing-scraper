import { useEffect, useState } from "react";
import {
  AMENITIES,
  STAGES,
  type ComposeVia,
  type ListingView,
  type Profile,
  type Stage,
} from "@housing/shared";
import {
  amenityLabel,
  formatBaths,
  formatBedRange,
  formatDate,
  formatDateTime,
  formatLease,
  formatMoney,
  formatPerPerson,
  formatSqft,
  formatWalk,
  headlinePrice,
  isRangedBuilding,
  perRoomNote,
  priceBasisLabel,
  propertyLabel,
  relativeTime,
  scamLabel,
  scoreWord,
  sourceLabel,
  telHref,
} from "../lib/format.ts";
import { rejectReason } from "../lib/reasons.ts";
import { stageColor, stageLabel } from "../lib/stage.ts";
import { GONE_TITLE, pickMatch } from "./ListingRow.tsx";
import { DraftPanel } from "./DraftPanel.tsx";
import { Chip, Meter, ScorePlate } from "./ui.tsx";
import { IconExternal, IconHide, IconMail, IconPhone, IconShow, IconStar, IconWarn } from "./icons.tsx";

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-ink-2">{label}</dt>
      <dd className="med num mt-0.5 text-[13.5px]">{value}</dd>
    </div>
  );
}

function Gallery({ photos, title }: { photos: string[]; title: string }) {
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const usable = photos.filter((url) => !failed.includes(url));

  if (usable.length === 0) {
    return (
      <div className="flex h-[168px] items-center justify-center bg-surface-2 text-[13px] text-ink-3">
        No photos on this listing
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        className="scroll-x flex snap-x snap-mandatory"
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        }}
        aria-label={`Photos of ${title}`}
      >
        {usable.map((url, i) => (
          <img
            key={url}
            src={url}
            alt={`Photo ${i + 1} of ${usable.length}`}
            referrerPolicy="no-referrer"
            loading={i === 0 ? "eager" : "lazy"}
            onError={() => setFailed((previous) => [...previous, url])}
            className="h-[220px] w-full shrink-0 snap-start bg-surface-2 object-cover lg:h-[260px]"
          />
        ))}
      </div>
      {usable.length > 1 ? (
        <span
          className="num absolute bottom-2 right-2 rounded-full bg-shade px-2 py-0.5 text-[11.5px] text-white"
          data-testid="gallery-count"
        >
          {Math.min(index + 1, usable.length)} of {usable.length}
        </span>
      ) : null}
    </div>
  );
}

function PriceHistory({ points }: { points: { price: number; at: string }[] }) {
  if (points.length < 2) return null;
  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = Math.max(1, max - min);
  const width = 260;
  const height = 44;
  const path = points
    .map((point, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - ((point.price - min) / span) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const first = points[0];
  const last = points[points.length - 1];
  const change = first && last ? last.price - first.price : 0;

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-11 w-full max-w-[320px]"
        role="img"
        aria-label={`Price moved from ${formatMoney(first?.price ?? null)} to ${formatMoney(last?.price ?? null)}`}
      >
        <path d={path} fill="none" stroke="var(--moss)" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <p className="num mt-1.5 text-[12.5px] text-ink-2">
        {change === 0
          ? "Price has not moved"
          : `${change < 0 ? "Down" : "Up"} ${formatMoney(Math.abs(change))} since ${formatDate(first?.at ?? null)}`}
      </p>
    </div>
  );
}

export function ListingDetail({
  view,
  profiles,
  profileId,
  composeVia,
  smtpConfigured,
  onPatch,
}: {
  view: ListingView;
  profiles: Profile[];
  profileId: string | null;
  composeVia: ComposeVia;
  smtpConfigured: boolean;
  onPatch: (patch: { stage?: Stage; starred?: boolean; hidden?: boolean; notes?: string }) => void;
}) {
  const { listing, state } = view;
  const match = pickMatch(view, profileId);
  const [notes, setNotes] = useState(state.notes);
  useEffect(() => setNotes(state.notes), [state.notes]);

  const presentAmenities = AMENITIES.filter((amenity) => listing.amenities[amenity] === true);
  const facts: { label: string; value: string }[] = [];
  const missing: string[] = [];
  const fact = (label: string, value: string | null, missingName: string) => {
    if (value === null) missing.push(missingName);
    else facts.push({ label, value });
  };

  fact("Bedrooms", listing.beds === null ? null : formatBedRange(listing.beds, listing.bedsMax), "bedroom count");
  fact("Bathrooms", listing.baths === null ? null : formatBaths(listing.baths), "bathroom count");
  fact("Size", listing.sqft === null ? null : formatSqft(listing.sqft), "size");
  fact(
    "Type",
    listing.propertyType === "unknown" ? null : propertyLabel(listing.propertyType),
    "property type",
  );
  fact("Move in", listing.availableDate === null ? null : formatDate(listing.availableDate), "move-in date");
  fact("Lease", listing.leaseMonths === null ? null : formatLease(listing.leaseMonths), "lease length");
  fact("Posted", listing.postedAt === null ? null : formatDate(listing.postedAt), "posted date");
  facts.push({ label: "Last seen", value: relativeTime(listing.lastSeenAt) });
  if (listing.isSublet) facts.push({ label: "Sublet", value: "Yes" });
  if (listing.priceBasis === "room") {
    facts.push({ label: "Priced", value: priceBasisLabel(listing.priceBasis) });
  }
  if (listing.incomeRestricted) facts.push({ label: "Income restricted", value: "Yes" });
  if (listing.seniorHousing) facts.push({ label: "Senior housing", value: "Yes" });

  const ranged = isRangedBuilding(listing.beds, listing.bedsMax, listing.price, listing.priceMax);
  const price = headlinePrice(
    listing.price,
    listing.priceMax,
    listing.priceBasis,
    match?.monthlyTotal ?? null,
  );

  return (
    <div className="pb-8" data-testid="listing-detail">
      <Gallery photos={listing.photos} title={listing.title} />

      <div className="px-4 pt-4 lg:px-6">
        <div className="flex items-start gap-3">
          {match ? <ScorePlate score={match.score} size="lg" /> : null}
          <div className="min-w-0 flex-1">
            <p className="num cond text-[26px] leading-none">{price.headline}</p>
            <p className="num mt-1 flex flex-wrap gap-x-3 text-[13px] text-ink-2">
              <span>{formatPerPerson(match?.pricePerPerson ?? null)}</span>
              {price.perRoom ? <span>{price.perRoom}</span> : null}
              {match ? <span>{scoreWord(match.score)}</span> : null}
            </p>
            {listing.priceBasis === "room" ? (
              <p className="mt-1.5 max-w-[52ch] text-[12.5px] text-ink-2">
                {perRoomNote(listing.price, listing.beds)}
              </p>
            ) : null}
            {ranged ? (
              <p className="mt-1.5 max-w-[52ch] text-[12.5px] text-ink-2">
                This is a building with several floor plans, so the rent depends on which unit you
                take. The score and the split above are for the plan that fits this profile.
              </p>
            ) : null}
          </div>
        </div>

        <h2 className="semi mt-3 text-[17px] leading-snug">{listing.address ?? listing.title}</h2>
        <p className="mt-1 text-[13px] text-ink-2">
          {listing.neighborhood ? `${listing.neighborhood}. ` : ""}
          {formatWalk(match?.walkMinutes ?? null)}
          {match?.distanceMiles !== null && match?.distanceMiles !== undefined
            ? `, ${match.distanceMiles.toFixed(1)} mi`
            : ""}
          . First seen {relativeTime(listing.firstSeenAt)}.
        </p>

        {listing.status === "gone" ? (
          <p className="mt-3">
            <Chip tone="quiet" title={GONE_TITLE}>
              Not seen lately
            </Chip>
          </p>
        ) : null}

        {listing.scamSignals.length > 0 ? (
          <div className="mt-3 rounded-[8px] border border-brick bg-brick-soft px-3 py-2.5">
            <p className="semi flex items-center gap-1.5 text-[13.5px] text-brick">
              <IconWarn className="h-4 w-4" />
              This one looks like a scam
            </p>
            <ul className="mt-1.5 flex flex-col gap-0.5 text-[12.5px] text-ink-2">
              {listing.scamSignals.map((signal) => (
                <li key={signal}>{scamLabel(signal)}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="detail-stage">
            Stage
          </label>
          <select
            id="detail-stage"
            className="field w-auto min-w-[140px] text-[14px]"
            value={state.stage}
            onChange={(e) => onPatch({ stage: e.currentTarget.value as Stage })}
          >
            {STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {stageLabel(stage)}
              </option>
            ))}
          </select>
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: stageColor(state.stage) }}
          />
          <button
            type="button"
            className={`ctl flex items-center gap-1.5 text-[13.5px] ${state.starred ? "semi border-transparent bg-moss-soft" : ""}`}
            aria-pressed={state.starred}
            onClick={() => onPatch({ starred: !state.starred })}
          >
            <IconStar className="h-4 w-4" filled={state.starred} />
            {state.starred ? "Starred" : "Star"}
          </button>
          <button
            type="button"
            className="ctl flex items-center gap-1.5 text-[13.5px]"
            aria-pressed={state.hidden}
            onClick={() => onPatch({ hidden: !state.hidden })}
          >
            {state.hidden ? <IconShow className="h-4 w-4" /> : <IconHide className="h-4 w-4" />}
            {state.hidden ? "Unhide" : "Hide"}
          </button>
        </div>
      </div>

      <section className="mt-5 border-t border-rule px-4 py-4 lg:px-6">
        <h3 className="wide text-[14px]">Facts</h3>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          {facts.map((fact) => (
            <Fact key={fact.label} label={fact.label} value={fact.value} />
          ))}
        </dl>
        {missing.length > 0 ? (
          <p className="mt-3 text-[12.5px] text-ink-3">Not listed: {missing.join(", ")}</p>
        ) : null}

        {presentAmenities.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {presentAmenities.map((amenity) => (
              <Chip key={amenity} tone="quiet">
                {amenityLabel(amenity)}
              </Chip>
            ))}
          </div>
        ) : null}

        {listing.description ? (
          <p className="mt-4 max-w-[70ch] whitespace-pre-line text-[13.5px] leading-relaxed text-ink-2">
            {listing.description}
          </p>
        ) : null}
      </section>

      {match ? (
        <section className="border-t border-rule px-4 py-4 lg:px-6">
          <h3 className="wide text-[14px]">Why it scored {Math.round(match.score)}</h3>
          <div className="mt-3 flex flex-col gap-2">
            <Meter label="Price" value={match.breakdown.price} />
            <Meter label="Distance" value={match.breakdown.distance} />
            <Meter label="Amenities" value={match.breakdown.amenities} />
            <Meter label="Size" value={match.breakdown.size} />
            <Meter label="Freshness" value={match.breakdown.freshness} />
          </div>
          {match.breakdown.keywordBoost !== 0 ? (
            <p className="num mt-2 text-[12.5px] text-ink-2">
              Keyword boost {match.breakdown.keywordBoost > 0 ? "+" : ""}
              {Math.round(match.breakdown.keywordBoost)}
            </p>
          ) : null}
        </section>
      ) : null}

      {view.matches.length > 0 ? (
        <section className="border-t border-rule px-4 py-4 lg:px-6">
          <h3 className="wide text-[14px]">Every profile</h3>
          <ul className="row-stack mt-2">
            {view.matches.map((item) => {
              const profile = profiles.find((p) => p.id === item.profileId);
              return (
                <li key={item.profileId} className="flex items-start gap-3 py-2.5">
                  <ScorePlate score={item.score} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="med flex items-center gap-2 text-[13.5px]">
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: profile?.color ?? "var(--rule-strong)" }}
                      />
                      {profile?.name ?? item.profileId}
                    </p>
                    {item.matched ? (
                      <p className="num mt-0.5 text-[12.5px] text-ink-2">
                        Matches. {formatPerPerson(item.pricePerPerson)},{" "}
                        {formatWalk(item.walkMinutes)}.
                      </p>
                    ) : (
                      <ul className="mt-1 flex flex-col gap-0.5 text-[12.5px] text-brick">
                        {item.rejectedBy.map((reason) => (
                          <li key={reason}>{rejectReason(reason)}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {listing.priceHistory.length > 1 ? (
        <section className="border-t border-rule px-4 py-4 lg:px-6">
          <h3 className="wide text-[14px]">Price history</h3>
          <div className="mt-3">
            <PriceHistory points={listing.priceHistory} />
          </div>
        </section>
      ) : null}

      <section className="border-t border-rule px-4 py-4 lg:px-6">
        <h3 className="wide text-[14px]">Seen on</h3>
        <ul className="mt-2 flex flex-col gap-1.5">
          {listing.sources.map((source) => (
            <li key={`${source.sourceId}-${source.sourceListingId}`}>
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer noopener"
                className="med flex min-h-[44px] items-center gap-2 text-[14px] text-ink hover:text-moss"
              >
                <IconExternal className="h-4 w-4 text-ink-2" />
                {sourceLabel(source.sourceId)}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-rule px-4 py-4 lg:px-6">
        <h3 className="wide text-[14px]">Contact</h3>
        {listing.contact.name || listing.contact.company ? (
          <p className="med mt-2 text-[13.5px]">
            {[listing.contact.name, listing.contact.company].filter(Boolean).join(", ")}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-2">
          {listing.contact.phone ? (
            <a
              className="ctl med flex items-center gap-1.5 text-[14px]"
              href={telHref(listing.contact.phone)}
            >
              <IconPhone className="h-4 w-4" />
              {listing.contact.phone}
            </a>
          ) : null}
          {listing.contact.email ? (
            <a
              className="ctl med flex items-center gap-1.5 text-[14px]"
              href={`mailto:${listing.contact.email}`}
            >
              <IconMail className="h-4 w-4" />
              {listing.contact.email}
            </a>
          ) : null}
          {listing.contact.formUrl ? (
            <a
              className="ctl med flex items-center gap-1.5 text-[14px]"
              href={listing.contact.formUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              <IconExternal className="h-4 w-4" />
              Reply form
            </a>
          ) : null}
          {!listing.contact.phone && !listing.contact.email && !listing.contact.formUrl ? (
            <p className="text-[13px] text-ink-2">
              No contact details were found. Open the listing on its source to reply there.
            </p>
          ) : null}
        </div>
      </section>

      <section className="border-t border-rule px-4 py-4 lg:px-6">
        <h3 className="wide text-[14px]">Outreach</h3>
        <div className="mt-3">
          <DraftPanel
            listingId={listing.id}
            profileId={profileId}
            draftIds={view.draftIds}
            contact={listing.contact}
            composeVia={composeVia}
            smtpConfigured={smtpConfigured}
            compact
          />
        </div>
      </section>

      <section className="border-t border-rule px-4 py-4 lg:px-6">
        <label className="flex flex-col gap-1.5">
          <span className="wide text-[14px]">Notes</span>
          <textarea
            className="field text-[14px]"
            rows={4}
            value={notes}
            placeholder="Who you spoke to, what they said, what to check at the tour."
            onChange={(e) => setNotes(e.currentTarget.value)}
            onBlur={() => {
              if (notes !== state.notes) onPatch({ notes });
            }}
          />
        </label>
        <p className="mt-1.5 text-[12px] text-ink-3">
          Saved when you tap away. Last seen {formatDateTime(listing.lastSeenAt)}.
        </p>
      </section>
    </div>
  );
}
