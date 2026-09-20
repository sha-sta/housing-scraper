import { Link } from "react-router";
import { Empty, PageHeader, Spinner } from "../../components/ui.tsx";
import { IconPlus } from "../../components/icons.tsx";
import { useProfiles } from "../../lib/queries.ts";
import { formatMoney, formatWalk, pluralize } from "../../lib/format.ts";

export function Profiles() {
  const profiles = useProfiles();
  const items = profiles.data ?? [];

  return (
    <div>
      <PageHeader
        title="Profiles"
        hint="A profile is one search: who is living there, what you can pay, and how far you will walk."
        actions={
          <Link
            to="/settings/profiles/new"
            className="ctl-primary semi flex items-center gap-1.5 px-4 text-[13.5px]"
          >
            <IconPlus className="h-4 w-4" />
            New profile
          </Link>
        }
      />

      {profiles.isPending ? <Spinner label="Loading profiles" /> : null}

      {!profiles.isPending && items.length === 0 ? (
        <Empty
          title="No profiles yet"
          next="Make one and the feed starts filling as each source runs."
          action={
            <Link to="/settings/profiles/new" className="ctl-primary med flex items-center px-4 text-[14px]">
              Create a profile
            </Link>
          }
        />
      ) : null}

      <ul className="row-stack border-t border-rule">
        {items.map((profile) => {
          const prefs = profile.preferences;
          return (
            <li key={profile.id} className="relative bg-surface">
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 w-[3px]"
                style={{ background: profile.color, opacity: profile.enabled ? 1 : 0.3 }}
              />
              <Link to={`/settings/profiles/${profile.id}`} className="block py-3 pl-4 pr-4 lg:pl-6 lg:pr-6">
                <div className="flex items-baseline gap-2">
                  <span className="semi text-[15px]">{profile.name}</span>
                  {profile.enabled ? null : (
                    <span className="text-[12px] text-ink-2">not watching</span>
                  )}
                </div>
                <p className="num mt-1 flex flex-wrap gap-x-4 text-[12.5px] text-ink-2">
                  <span>{pluralize(prefs.group.size, "person", "people")}</span>
                  <span>
                    {prefs.beds.min} bd min
                    {prefs.beds.max === null ? "" : ` to ${prefs.beds.max}`}
                  </span>
                  <span>
                    {prefs.price.maxPerPerson === null
                      ? "no per-person cap"
                      : `${formatMoney(prefs.price.maxPerPerson)} each max`}
                  </span>
                  <span>
                    {prefs.location.maxWalkMinutes === null
                      ? "any distance"
                      : formatWalk(prefs.location.maxWalkMinutes)}
                  </span>
                  <span>{prefs.location.anchor.label}</span>
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
