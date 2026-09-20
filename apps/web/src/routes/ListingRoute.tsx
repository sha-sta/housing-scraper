import { useEffect, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { ListingDetail } from "../components/ListingDetail.tsx";
import { ErrorNote, Spinner } from "../components/ui.tsx";
import { IconBack, IconClose } from "../components/icons.tsx";
import { useListing, useListingState, useSettings } from "../lib/queries.ts";
import { useSelection } from "../lib/selection.tsx";
import { useIsDesktop } from "../lib/use-media.ts";
import { Feed } from "./Feed.tsx";

function useCloseHandler() {
  const navigate = useNavigate();
  const location = useLocation();
  return () => {
    if (location.key === "default") navigate("/");
    else navigate(-1);
  };
}

function Body({ id }: { id: string }) {
  const listing = useListing(id);
  const { data: settings } = useSettings();
  const { profiles, profileId } = useSelection();
  const listingState = useListingState();

  if (listing.isPending) return <Spinner label="Loading listing" />;
  if (listing.isError) return <ErrorNote error={listing.error} />;
  if (!listing.data) return <Spinner label="Loading listing" />;

  return (
    <ListingDetail
      view={listing.data}
      profiles={profiles}
      profileId={profileId}
      composeVia={settings?.composeVia ?? "mailto"}
      smtpConfigured={settings?.smtpConfigured ?? false}
      onPatch={(patch) => listingState.mutate({ id, patch })}
    />
  );
}

export function ListingRoute() {
  const { id } = useParams();
  const isDesktop = useIsDesktop();
  const close = useCloseHandler();
  const listing = useListing(id);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isDesktop) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [isDesktop, close]);

  if (!id) return <ErrorNote error={new Error("No listing id in the address")} />;

  const heading = listing.data?.listing.address ?? listing.data?.listing.title ?? "Listing";

  if (!isDesktop) {
    return (
      <div>
        <div className="sticky top-12 z-20 flex items-center gap-1 border-b border-rule bg-ground/95 px-1 py-1 backdrop-blur">
          <button
            type="button"
            onClick={close}
            className="tap flex items-center justify-center text-ink-2"
            aria-label="Back to the feed"
          >
            <IconBack />
          </button>
          <span className="semi truncate text-[14px]">{heading}</span>
        </div>
        <Body id={id} />
      </div>
    );
  }

  return (
    <>
      <Feed />
      <div className="fixed inset-0 z-40 flex justify-end">
        <button
          type="button"
          aria-label="Close listing"
          onClick={close}
          className="flex-1 bg-shade"
          tabIndex={-1}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label={heading}
          className="enter-side flex h-dvh w-[560px] max-w-[92vw] flex-col overflow-y-auto border-l border-rule bg-surface"
        >
          <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-rule bg-surface/95 px-3 py-2 backdrop-blur">
            <span className="semi min-w-0 flex-1 truncate text-[14px]">{heading}</span>
            <button
              ref={closeRef}
              type="button"
              onClick={close}
              className="tap flex items-center justify-center text-ink-2 hover:text-ink"
              aria-label="Close listing"
            >
              <IconClose />
            </button>
          </div>
          <Body id={id} />
        </div>
      </div>
    </>
  );
}
