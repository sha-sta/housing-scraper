import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { Notification } from "@housing/shared";
import { Chip, Empty, ErrorNote, PageHeader, Spinner } from "../components/ui.tsx";
import { useMarkNotificationsRead, useNotifications } from "../lib/queries.ts";
import { relativeTime } from "../lib/format.ts";

const KIND_WORDS: Record<Notification["kind"], string> = {
  match: "New match",
  priceDrop: "Price drop",
  backOnMarket: "Back on the market",
  digest: "Quiet hours digest",
  draftSent: "Email sent",
  draftFailed: "Email failed",
  sourceDown: "Source down",
  sourceRecovered: "Source back up",
};

export function Notifications() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const notifications = useNotifications(unreadOnly || undefined);
  const markRead = useMarkNotificationsRead();
  const items = notifications.data ?? [];
  const unread = items.filter((item) => item.readAt === null).length;

  useEffect(() => {
    document.title = unread > 0 ? `Notifications (${unread})` : "Notifications";
    return () => {
      document.title = "Housing watch";
    };
  }, [unread]);

  return (
    <div>
      <PageHeader
        title="Notifications"
        hint="Everything the app pushed, and everything it held back during quiet hours."
        actions={
          <button
            type="button"
            className="ctl med text-[13.5px]"
            disabled={unread === 0 || markRead.isPending}
            onClick={() => markRead.mutate(undefined)}
          >
            Mark all read
          </button>
        }
      />

      <div className="flex gap-2 px-4 pb-3 lg:px-6">
        <button
          type="button"
          aria-pressed={unreadOnly}
          onClick={() => setUnreadOnly((value) => !value)}
          className={`ctl text-[13.5px] ${unreadOnly ? "semi border-transparent bg-moss-soft" : ""}`}
        >
          Unread only
        </button>
      </div>

      {notifications.isError ? <ErrorNote error={notifications.error} /> : null}
      {notifications.isPending ? <Spinner label="Loading notifications" /> : null}

      {!notifications.isPending && items.length === 0 ? (
        <Empty
          title={unreadOnly ? "Nothing unread" : "No notifications yet"}
          next="The app pushes when a listing matches above your minimum score. Check the ntfy topic in Settings if your phone stays quiet."
          action={
            <Link to="/settings" className="ctl med flex items-center px-4 text-[14px]">
              Open Settings
            </Link>
          }
        />
      ) : null}

      <ul className="row-stack border-t border-rule">
        {items.map((item) => {
          const body = (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone={item.kind === "sourceDown" || item.kind === "draftFailed" ? "brick" : "quiet"}>
                  {KIND_WORDS[item.kind]}
                </Chip>
                {item.pushed ? null : <Chip tone="plain">Held back</Chip>}
                <span className="num ml-auto text-[11.5px] text-ink-3">
                  {relativeTime(item.createdAt)}
                </span>
              </div>
              <p className="semi mt-1.5 text-[14px]">{item.title}</p>
              <p className="mt-0.5 text-[13px] text-ink-2">{item.body}</p>
            </>
          );
          return (
            <li
              key={item.id}
              className="relative bg-surface px-4 py-3 lg:px-6"
              data-testid="notification"
            >
              {item.readAt === null ? (
                <span
                  aria-label="Unread"
                  className="absolute left-1.5 top-4 h-[7px] w-[7px] rounded-full"
                  style={{ background: "var(--moss)" }}
                />
              ) : null}
              {item.listingId ? (
                <Link
                  to={`/listings/${item.listingId}`}
                  onClick={() => markRead.mutate([item.id])}
                  className="block"
                >
                  {body}
                </Link>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
