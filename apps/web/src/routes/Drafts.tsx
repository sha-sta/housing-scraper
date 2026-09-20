import { useState } from "react";
import { Link } from "react-router";
import { useQueries } from "@tanstack/react-query";
import type { Draft, DraftStatus } from "@housing/shared";
import { DraftEditor } from "../components/DraftPanel.tsx";
import { Chip, Empty, ErrorNote, PageHeader, Spinner } from "../components/ui.tsx";
import { IconChevron } from "../components/icons.tsx";
import { api } from "../lib/api.ts";
import { keys, useDraftMutations, useDrafts, useSettings } from "../lib/queries.ts";
import { formatDateTime, headlinePrice, relativeTime, shortAddress } from "../lib/format.ts";
import { useToast } from "../lib/toast.tsx";

const FILTERS: { value: DraftStatus | "all"; label: string }[] = [
  { value: "staged", label: "Waiting" },
  { value: "sent", label: "Sent" },
  { value: "failed", label: "Failed" },
  { value: "all", label: "All" },
];

export function Drafts() {
  const [filter, setFilter] = useState<DraftStatus | "all">("staged");
  const drafts = useDrafts(filter === "all" ? undefined : filter);
  const { data: settings } = useSettings();
  const mutations = useDraftMutations();
  const toast = useToast();
  const [openId, setOpenId] = useState<string | null>(null);

  const items = drafts.data ?? [];
  const listings = useQueries({
    queries: items.map((draft) => ({
      queryKey: keys.listing(draft.listingId),
      queryFn: () => api.listing(draft.listingId),
    })),
    combine: (results) => results.map((result) => result.data),
  });

  const active = openId ?? items[0]?.id ?? null;

  return (
    <div>
      <PageHeader
        title="Drafts"
        hint="Everything staged for outreach, newest first. Read it, fix a line, send it."
      />

      <div className="scroll-x flex gap-2 px-4 pb-3 lg:px-6">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={filter === option.value}
            onClick={() => setFilter(option.value)}
            className={`ctl shrink-0 px-4 text-[13.5px] ${filter === option.value ? "semi border-transparent bg-moss-soft" : ""}`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {drafts.isError ? <ErrorNote error={drafts.error} /> : null}
      {drafts.isPending ? <Spinner label="Loading drafts" /> : null}

      {!drafts.isPending && items.length === 0 ? (
        <Empty
          title={filter === "staged" ? "No drafts waiting" : "Nothing here"}
          next="Drafts appear on their own for strong matches when auto draft is on. You can also open a listing and write one."
          action={
            <Link to="/" className="ctl med flex items-center px-4 text-[14px]">
              Back to the feed
            </Link>
          }
        />
      ) : null}

      <div className="row-stack border-t border-rule">
        {items.map((draft, index) => {
          const view = listings[index];
          const listing = view?.listing;
          const open = draft.id === active;
          return (
            <div key={draft.id} className="bg-surface" data-testid="draft-item">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenId(open ? "" : draft.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left lg:px-6"
              >
                <div className="min-w-0 flex-1">
                  <p className="med truncate text-[14px]">
                    {listing?.address ? shortAddress(listing.address) : (listing?.title ?? draft.listingId)}
                  </p>
                  <p className="num mt-0.5 flex flex-wrap items-center gap-x-2.5 text-[12.5px] text-ink-2">
                    <span>
                      {
                        headlinePrice(
                          listing?.price ?? null,
                          listing?.priceMax ?? null,
                          listing?.priceBasis ?? "unit",
                          null,
                        ).headline
                      }
                    </span>
                    <span>{draft.to ?? "no address on file"}</span>
                    <span>
                      {draft.status === "sent"
                        ? `sent ${formatDateTime(draft.sentAt)}`
                        : relativeTime(draft.createdAt)}
                    </span>
                  </p>
                </div>
                <Chip tone={draft.status === "sent" ? "moss" : draft.status === "failed" ? "brick" : "quiet"}>
                  {draft.channel === "email" ? "Email" : draft.channel === "sms" ? "Text" : "Form"}
                </Chip>
                <IconChevron
                  className={`h-4 w-4 shrink-0 text-ink-3 transition-transform ${open ? "rotate-180" : ""}`}
                />
              </button>

              {open && listing ? (
                <div className="border-t border-rule px-4 py-4 lg:px-6">
                  <Link
                    to={`/listings/${listing.id}`}
                    className="med mb-3 inline-flex text-[13px] text-moss"
                  >
                    Open the listing
                  </Link>
                  <DraftEditor
                    draft={draft}
                    contact={listing.contact}
                    composeVia={settings?.composeVia ?? "mailto"}
                    smtpConfigured={settings?.smtpConfigured ?? false}
                    compact
                    onToast={toast.push}
                    mutations={mutations}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
