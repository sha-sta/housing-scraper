import { NavLink, Outlet, useLocation } from "react-router";
import { useLive } from "../lib/live.tsx";
import { useStats } from "../lib/queries.ts";
import {
  IconBell,
  IconDraft,
  IconFeed,
  IconMap,
  IconMore,
  IconPipeline,
  IconSettings,
} from "./icons.tsx";

type NavIcon = (props: { className?: string }) => React.ReactElement;

interface NavItem {
  to: string;
  label: string;
  icon: NavIcon;
}

const TABS: NavItem[] = [
  { to: "/", label: "Feed", icon: IconFeed },
  { to: "/map", label: "Map", icon: IconMap },
  { to: "/pipeline", label: "Pipeline", icon: IconPipeline },
  { to: "/drafts", label: "Drafts", icon: IconDraft },
  { to: "/more", label: "More", icon: IconMore },
];

const RAIL: NavItem[] = [
  { to: "/", label: "Feed", icon: IconFeed },
  { to: "/map", label: "Map", icon: IconMap },
  { to: "/pipeline", label: "Pipeline", icon: IconPipeline },
  { to: "/drafts", label: "Drafts", icon: IconDraft },
  { to: "/notifications", label: "Notifications", icon: IconBell },
  { to: "/sources", label: "Sources", icon: IconSettings },
];

export function LiveDot() {
  const { status } = useLive();
  const color =
    status === "live" ? "var(--moss)" : status === "connecting" ? "var(--ink-3)" : "var(--brick)";
  const label =
    status === "live" ? "Live" : status === "connecting" ? "Connecting" : "Reconnecting";
  return (
    <span className="flex items-center gap-1.5 text-[12px] text-ink-2" data-testid="live-status">
      <span
        aria-hidden="true"
        className={`h-[7px] w-[7px] rounded-full ${status === "live" ? "live-dot" : ""}`}
        style={{ background: color }}
      />
      <span className="med">{label}</span>
    </span>
  );
}

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="num cond absolute -top-0.5 right-0.5 min-w-[17px] rounded-full px-1 text-center text-[11px] leading-[17px]"
      style={{ background: "var(--brick)", color: "#fff" }}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function Shell() {
  const { data: stats } = useStats();
  const unread = stats?.unreadNotifications ?? 0;
  const location = useLocation();

  return (
    <div className="min-h-dvh lg:flex">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>

      <nav
        aria-label="Sections"
        className="sticky top-0 hidden h-dvh w-[212px] shrink-0 flex-col border-r border-rule bg-surface px-3 py-4 lg:flex"
      >
        <div className="mb-5 px-2">
          <span className="wide block text-[15px]">Housing watch</span>
          <span className="mt-1 block text-[12px] text-ink-2">Baltimore</span>
        </div>
        <ul className="flex flex-col gap-0.5">
          {RAIL.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `relative flex items-center gap-2.5 rounded-[var(--radius-ctl)] px-2.5 py-2 text-[14px] ${
                    isActive ? "semi bg-moss-soft text-ink" : "text-ink-2 hover:bg-surface-2"
                  }`
                }
              >
                <item.icon className="h-[18px] w-[18px]" />
                {item.label}
                {item.to === "/notifications" ? (
                  <span className="relative ml-auto block h-4 w-6">
                    <UnreadBadge count={unread} />
                  </span>
                ) : null}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="mt-auto flex flex-col gap-2 px-2.5 pt-4">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-2.5 text-[14px] ${isActive ? "semi text-ink" : "text-ink-2 hover:text-ink"}`
            }
          >
            <IconSettings className="h-[18px] w-[18px]" />
            Settings
          </NavLink>
          <LiveDot />
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-rule bg-ground/95 px-3 backdrop-blur lg:hidden">
          <span className="wide text-[14px]">Housing watch</span>
          <div className="ml-auto flex items-center gap-1">
            <LiveDot />
            <NavLink
              to="/notifications"
              aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
              className="tap relative flex items-center justify-center text-ink-2"
            >
              <IconBell />
              <UnreadBadge count={unread} />
            </NavLink>
          </div>
        </header>

        <main id="main" className="min-w-0 flex-1 pb-[76px] lg:pb-0">
          <Outlet />
        </main>

        <nav
          aria-label="Sections"
          className="safe-b fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-rule bg-surface lg:hidden"
        >
          {TABS.map((item) => {
            const active =
              item.to === "/"
                ? location.pathname === "/" || location.pathname.startsWith("/listings")
                : location.pathname.startsWith(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] ${
                  active ? "semi text-ink" : "text-ink-2"
                }`}
              >
                <span className="relative">
                  <item.icon className="h-[21px] w-[21px]" />
                  {active ? (
                    <span
                      aria-hidden="true"
                      className="absolute -bottom-1 left-1/2 h-[3px] w-4 -translate-x-1/2 rounded-full"
                      style={{ background: "var(--moss)" }}
                    />
                  ) : null}
                </span>
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
