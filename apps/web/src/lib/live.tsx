import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { API_PREFIX, ServerEventSchema } from "@housing/shared";
import { applyServerEvent } from "./queries.ts";
import { useToast } from "./toast.tsx";

export type LiveStatus = "connecting" | "live" | "reconnecting";

interface LiveValue {
  status: LiveStatus;
  /** Listing ids that arrived in this session, newest first, for the arrival highlight. */
  arrivals: string[];
  clearArrivals: () => void;
}

const LiveContext = createContext<LiveValue>({
  status: "connecting",
  arrivals: [],
  clearArrivals: () => {},
});

/** A dropped stream is normal on a laptop lid close, so hold "live" briefly before alarming. */
const GRACE_MS = 4000;
const ARRIVAL_LIMIT = 40;

export function LiveProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const [arrivals, setArrivals] = useState<string[]>([]);
  const graceTimer = useRef<number | null>(null);

  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const source = new EventSource(`${API_PREFIX}/events`);

    const clearGrace = () => {
      if (graceTimer.current !== null) {
        window.clearTimeout(graceTimer.current);
        graceTimer.current = null;
      }
    };

    source.onopen = () => {
      clearGrace();
      setStatus("live");
    };

    source.onerror = () => {
      if (graceTimer.current !== null) return;
      graceTimer.current = window.setTimeout(() => {
        graceTimer.current = null;
        setStatus("reconnecting");
      }, GRACE_MS);
    };

    source.onmessage = (message: MessageEvent<string>) => {
      let payload: unknown;
      try {
        payload = JSON.parse(message.data) as unknown;
      } catch {
        return;
      }
      const parsed = ServerEventSchema.safeParse(payload);
      if (!parsed.success) return;
      const event = parsed.data;
      applyServerEvent(qc, event);

      if (event.type === "listing.upserted" && event.isNew) {
        setArrivals((previous) =>
          [event.listingId, ...previous.filter((id) => id !== event.listingId)].slice(
            0,
            ARRIVAL_LIMIT,
          ),
        );
      }
      if (event.type === "notification.created" && event.notification.kind === "match") {
        toast.push({
          title: event.notification.title,
          body: event.notification.body,
          to: event.notification.listingId
            ? `/listings/${event.notification.listingId}`
            : undefined,
        });
      }
    };

    return () => {
      clearGrace();
      source.close();
    };
  }, [qc, toast]);

  const value = useMemo<LiveValue>(
    () => ({ status, arrivals, clearArrivals: () => setArrivals([]) }),
    [status, arrivals],
  );

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLive(): LiveValue {
  return useContext(LiveContext);
}
