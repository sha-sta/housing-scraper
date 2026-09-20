import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Circle, CircleMarker, MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { ListingView } from "@housing/shared";
import { ProfileSwitcher } from "./Feed.tsx";
import { pickMatch } from "../components/ListingRow.tsx";
import { Empty, ErrorNote, ScorePlate, Spinner } from "../components/ui.tsx";
import { IconClose } from "../components/icons.tsx";
import { useListings } from "../lib/queries.ts";
import { useSelection } from "../lib/selection.tsx";
import {
  formatBedRange,
  formatPerPerson,
  formatWalk,
  headlinePrice,
  scoreBand,
  shortAddress,
} from "../lib/format.ts";

/** Straight-line metres that the match engine's 1.3x detour factor at 3 mph covers. */
function walkMinutesToMeters(minutes: number): number {
  const miles = (minutes / 60) * 3;
  return (miles / 1.3) * 1609.34;
}

const BAND_FILL = ["var(--band-0-fg)", "var(--band-1-fg)", "var(--band-2-bg)", "var(--band-3-bg)"];

function anchorIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    html: `<span style="display:block;width:18px;height:18px;border-radius:50%;border:3px solid var(--moss);background:var(--surface);box-shadow:0 0 0 2px var(--surface)"></span>`,
  });
}

function Recenter({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  map.setView([lat, lon], map.getZoom(), { animate: false });
  return null;
}

export function MapRoute() {
  const { profile, profileId } = useSelection();
  const [selected, setSelected] = useState<ListingView | null>(null);

  const listings = useListings({
    profileId: profileId ?? undefined,
    scope: "matched",
    sort: "score",
    limit: 200,
  });

  const items = listings.data?.items ?? [];
  const placed = useMemo(
    () => items.filter((item) => item.listing.lat !== null && item.listing.lon !== null),
    [items],
  );

  const anchor = profile?.preferences.location.anchor;
  const maxWalk = profile?.preferences.location.maxWalkMinutes ?? null;

  if (listings.isError) return <ErrorNote error={listings.error} />;

  return (
    <div className="flex h-[calc(100dvh-48px)] flex-col lg:h-dvh">
      <div className="shrink-0 border-b border-rule bg-ground pt-3 lg:pt-5">
        <div className="flex items-baseline justify-between px-4 pb-2.5 lg:px-6">
          <h1 className="wide text-[19px] leading-none lg:text-[22px]">Map</h1>
          <span className="num text-[12.5px] text-ink-2">{placed.length} on the map</span>
        </div>
        <ProfileSwitcher />
        <div className="h-3" />
      </div>

      {listings.isPending ? <Spinner label="Loading the map" /> : null}

      {!listings.isPending && !anchor ? (
        <Empty
          title="No profile to centre on"
          next="A profile sets the campus anchor the map draws its walk circle around. Make one first."
          action={
            <Link to="/settings" className="ctl-primary med flex items-center px-4 text-[14px]">
              Create a profile
            </Link>
          }
        />
      ) : null}

      {anchor ? (
        <div className="relative min-h-0 flex-1">
          <MapContainer
            center={[anchor.lat, anchor.lon]}
            zoom={14}
            scrollWheelZoom
            className="h-full w-full"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={19}
            />
            <Recenter lat={anchor.lat} lon={anchor.lon} />
            {maxWalk !== null ? (
              <Circle
                center={[anchor.lat, anchor.lon]}
                radius={walkMinutesToMeters(maxWalk)}
                pathOptions={{
                  color: profile?.color ?? "var(--moss)",
                  weight: 1.5,
                  fillOpacity: 0.06,
                }}
              />
            ) : null}
            <Marker position={[anchor.lat, anchor.lon]} icon={anchorIcon()} title={anchor.label} />
            {placed.map((item) => {
              const match = pickMatch(item, profileId);
              const band = scoreBand(match?.score ?? 0);
              return (
                <CircleMarker
                  key={item.listing.id}
                  center={[item.listing.lat ?? 0, item.listing.lon ?? 0]}
                  radius={9}
                  pathOptions={{
                    color: "var(--surface)",
                    weight: 2,
                    fillColor: BAND_FILL[band],
                    fillOpacity: 1,
                  }}
                  eventHandlers={{ click: () => setSelected(item) }}
                />
              );
            })}
          </MapContainer>

          {selected ? (
            <div className="absolute inset-x-3 bottom-3 z-[1000] rounded-[10px] border border-rule bg-surface p-3 shadow-[0_10px_30px_-16px_rgb(0_0_0/0.6)] lg:right-auto lg:w-[360px]">
              <div className="flex items-start gap-3">
                <ScorePlate score={pickMatch(selected, profileId)?.score ?? 0} />
                <div className="min-w-0 flex-1">
                  <p className="num cond text-[18px] leading-none">
                    {
                      headlinePrice(
                        selected.listing.price,
                        selected.listing.priceMax,
                        selected.listing.priceBasis,
                        pickMatch(selected, profileId)?.monthlyTotal ?? null,
                      ).headline
                    }
                  </p>
                  <p className="num mt-1 flex flex-wrap gap-x-3 text-[12.5px] text-ink-2">
                    <span>
                      {formatPerPerson(pickMatch(selected, profileId)?.pricePerPerson ?? null)}
                    </span>
                    <span>{formatBedRange(selected.listing.beds, selected.listing.bedsMax)}</span>
                    <span>{formatWalk(pickMatch(selected, profileId)?.walkMinutes ?? null)}</span>
                  </p>
                  <p className="med mt-1 truncate text-[13.5px]">
                    {selected.listing.address ? shortAddress(selected.listing.address) : selected.listing.title}
                  </p>
                  <Link
                    to={`/listings/${selected.listing.id}`}
                    className="ctl-primary med mt-2.5 inline-flex items-center px-3 text-[13.5px]"
                  >
                    Open listing
                  </Link>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  aria-label="Close this listing card"
                  className="tap -mr-2 -mt-2 flex items-center justify-center text-ink-2"
                >
                  <IconClose />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
