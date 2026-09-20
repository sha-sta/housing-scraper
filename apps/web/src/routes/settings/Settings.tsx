import { NavLink, Outlet } from "react-router";

const TABS = [
  { to: "/settings", label: "Profiles", end: true },
  { to: "/settings/identity", label: "You" },
  { to: "/settings/ntfy", label: "Phone pushes" },
  { to: "/settings/templates", label: "Templates" },
  { to: "/settings/mail", label: "Mail" },
];

export function Settings() {
  return (
    <div>
      <nav
        aria-label="Settings sections"
        className="scroll-x sticky top-12 z-20 flex gap-1 border-b border-rule bg-ground/95 px-3 pt-3 backdrop-blur lg:top-0 lg:px-5 lg:pt-5"
      >
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `flex min-h-[44px] shrink-0 items-center border-b-2 px-3 text-[13.5px] ${
                isActive ? "semi border-moss text-ink" : "border-transparent text-ink-2"
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
