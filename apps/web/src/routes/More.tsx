import { Link } from "react-router";
import { PageHeader } from "../components/ui.tsx";
import { IconBell, IconSettings } from "../components/icons.tsx";
import { useStats } from "../lib/queries.ts";
import { LiveDot } from "../components/Shell.tsx";

export function More() {
  const { data: stats } = useStats();

  const numbers = [
    { label: "Matching now", value: stats?.matchedListings },
    { label: "New in 24 hours", value: stats?.newLast24h },
    { label: "Drafts waiting", value: stats?.stagedDrafts },
    { label: "Sources down", value: stats?.sourcesDown },
  ];

  return (
    <div>
      <PageHeader title="More" />

      <dl className="grid grid-cols-2 gap-px border-y border-rule bg-rule">
        {numbers.map((item) => (
          <div key={item.label} className="bg-surface px-4 py-3">
            <dt className="text-[12px] text-ink-2">{item.label}</dt>
            <dd className="num cond mt-0.5 text-[24px] leading-none">
              {item.value === undefined ? (
                <span className="block h-[22px] w-10 rounded bg-surface-2" aria-label="loading" />
              ) : (
                item.value
              )}
            </dd>
          </div>
        ))}
      </dl>

      <ul className="row-stack mt-4 border-y border-rule">
        <li className="bg-surface">
          <Link
            to="/notifications"
            className="flex min-h-[56px] items-center gap-3 px-4 text-[15px]"
          >
            <IconBell className="h-[18px] w-[18px] text-ink-2" />
            Notifications
            {stats && stats.unreadNotifications > 0 ? (
              <span className="num ml-auto text-[13px] text-ink-2">
                {stats.unreadNotifications} unread
              </span>
            ) : null}
          </Link>
        </li>
        <li className="bg-surface">
          <Link to="/sources" className="flex min-h-[56px] items-center gap-3 px-4 text-[15px]">
            <IconSettings className="h-[18px] w-[18px] text-ink-2" />
            Sources
          </Link>
        </li>
        <li className="bg-surface">
          <Link to="/settings" className="flex min-h-[56px] items-center gap-3 px-4 text-[15px]">
            <IconSettings className="h-[18px] w-[18px] text-ink-2" />
            Settings
          </Link>
        </li>
      </ul>

      <div className="px-4 py-5">
        <LiveDot />
      </div>
    </div>
  );
}
