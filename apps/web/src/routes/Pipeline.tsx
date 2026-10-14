import { useState } from "react";
import { Link } from "react-router";
import { useQueries } from "@tanstack/react-query";
import { STAGES, type ListingView, type Stage } from "@housing/shared";
import { ProfileSwitcher } from "./Feed.tsx";
import { pickMatch } from "../components/ListingRow.tsx";
import { ScorePlate } from "../components/ui.tsx";
import { IconChevron } from "../components/icons.tsx";
import { api } from "../lib/api.ts";
import { readPassedOpen, writePassedOpen } from "../lib/passed-column.ts";
import { keys, useListingState } from "../lib/queries.ts";
import { useSelection } from "../lib/selection.tsx";
import { useIsDesktop } from "../lib/use-media.ts";
import { formatWalk, headlinePrice, shortAddress } from "../lib/format.ts";
import { stageColor, stageHint, stageLabel } from "../lib/stage.ts";

function Card({
  view,
  profileId,
  draggable,
  onStage,
  onDragStart,
}: {
  view: ListingView;
  profileId: string | null;
  draggable: boolean;
  onStage: (stage: Stage) => void;
  onDragStart: () => void;
}) {
  const match = pickMatch(view, profileId);
  return (
    <article
      draggable={draggable}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", view.listing.id);
        onDragStart();
      }}
      className="rounded-[8px] border border-rule bg-surface p-2.5"
      data-testid="pipeline-card"
      data-listing-id={view.listing.id}
    >
      <div className="flex items-start gap-2">
        <ScorePlate score={match?.score ?? 0} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="num cond text-[15px] leading-none">
            {
              headlinePrice(
                view.listing.price,
                view.listing.priceMax,
                view.listing.priceBasis,
                match?.monthlyTotal ?? null,
              ).headline
            }
          </p>
          <Link
            to={`/listings/${view.listing.id}`}
            className="med mt-1 block truncate text-[13px] hover:text-moss"
          >
            {view.listing.address ? shortAddress(view.listing.address) : view.listing.title}
          </Link>
          <p className="num mt-0.5 text-[11.5px] text-ink-3">
            {formatWalk(match?.walkMinutes ?? null)}
          </p>
        </div>
      </div>
      <label className="mt-2 block">
        <span className="sr-only">
          Stage for {view.listing.address ?? view.listing.title}
        </span>
        <select
          className="field min-h-[44px] py-1 text-[12.5px]"
          value={view.state.stage}
          onChange={(event) => onStage(event.currentTarget.value as Stage)}
        >
          {STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {stageLabel(stage)}
            </option>
          ))}
        </select>
      </label>
    </article>
  );
}

export function Pipeline() {
  const { profileId, profiles } = useSelection();
  const isDesktop = useIsDesktop();
  const listingState = useListingState();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<Stage | null>(null);
  const [passedOpen, setPassedOpen] = useState(readPassedOpen);

  function showPassed(open: boolean) {
    setPassedOpen(open);
    writePassedOpen(open);
  }

  const columns = useQueries({
    queries: STAGES.map((stage) => {
      const query = {
        profileId: profileId ?? undefined,
        // Everything past "new" was put there on purpose, so it stays visible even if the
        // profile later stops matching it.
        scope: stage === "new" ? ("matched" as const) : ("all" as const),
        stage,
        includeGone: stage !== "new",
        sort: "score" as const,
        limit: 60,
      };
      return { queryKey: keys.listingList(query), queryFn: () => api.listings(query) };
    }),
    combine: (results) => results.map((result) => result.data?.items ?? []),
  });

  function move(id: string, stage: Stage) {
    listingState.mutate({ id, patch: { stage } });
  }

  return (
    <div>
      <div className="border-b border-rule pt-3 lg:pt-5">
        <div className="flex items-baseline justify-between px-4 pb-2.5 lg:px-6">
          <h1 className="wide text-[19px] leading-none lg:text-[22px]">Pipeline</h1>
          <span className="text-[12.5px] text-ink-2">
            {isDesktop ? "Drag a card, or use its stage menu" : "Use the stage menu on a card"}
          </span>
        </div>
        <ProfileSwitcher />
        <div className="h-3" />
      </div>

      {profiles.length === 0 ? (
        <p className="px-4 py-8 text-[13px] text-ink-2 lg:px-6">
          Make a profile first. The pipeline tracks the listings that profile matched.
        </p>
      ) : null}

      <div className="scroll-x flex snap-x gap-3 px-4 py-4 lg:px-6">
        {STAGES.map((stage, index) => {
          const items = columns[index] ?? [];
          const isOver = over === stage;
          const folded = stage === "passed" && !passedOpen;
          const dot = (
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: stageColor(stage) }}
            />
          );
          const count = (
            <span className="num text-[12px] text-ink-2" data-testid={`stage-count-${stage}`}>
              {items.length}
            </span>
          );
          return (
            <section
              key={stage}
              onDragOver={(event) => {
                if (!dragging) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setOver(stage);
              }}
              onDragLeave={() => setOver((current) => (current === stage ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                const id = event.dataTransfer.getData("text/plain") || dragging;
                setOver(null);
                setDragging(null);
                if (id) move(id, stage);
              }}
              className={`flex shrink-0 snap-start flex-col rounded-[10px] border ${
                folded ? "w-[52px] p-1.5" : "w-[78vw] p-2.5 sm:w-[268px]"
              } ${isOver ? "border-moss bg-moss-soft" : "border-rule bg-surface-2"}`}
              data-testid={`stage-column-${stage}`}
              data-folded={folded ? "true" : "false"}
              aria-label={stageLabel(stage)}
            >
              {folded ? (
                <h2>
                  <button
                    type="button"
                    onClick={() => showPassed(true)}
                    aria-expanded={false}
                    className="med flex min-h-[120px] w-full flex-1 flex-col items-center gap-2 py-2 text-[12.5px] text-ink-2"
                  >
                    {dot}
                    {count}
                    <span style={{ writingMode: "vertical-rl" }}>{stageLabel(stage)}</span>
                  </button>
                </h2>
              ) : (
                <>
                  <h2 className="med px-1 pb-2 text-[13.5px]">
                    {stage === "passed" ? (
                      <button
                        type="button"
                        onClick={() => showPassed(false)}
                        aria-expanded={true}
                        className="flex min-h-[44px] w-full items-center gap-2"
                      >
                        {dot}
                        {stageLabel(stage)}
                        <span className="ml-auto flex items-center gap-1">
                          {count}
                          <IconChevron
                            className="h-4 w-4 rotate-90 text-ink-2"
                            aria-hidden="true"
                          />
                        </span>
                      </button>
                    ) : (
                      <span className="flex items-center gap-2">
                        {dot}
                        {stageLabel(stage)}
                        <span className="ml-auto">{count}</span>
                      </span>
                    )}
                  </h2>
                  <div className="flex flex-col gap-2">
                    {items.map((view) => (
                      <Card
                        key={view.listing.id}
                        view={view}
                        profileId={profileId}
                        draggable={isDesktop}
                        onStage={(next) => move(view.listing.id, next)}
                        onDragStart={() => setDragging(view.listing.id)}
                      />
                    ))}
                    {items.length === 0 ? (
                      <p className="px-1 py-3 text-[12.5px] text-ink-3">{stageHint(stage)}</p>
                    ) : null}
                  </div>
                </>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
