import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  AMENITIES,
  PROPERTY_TYPES,
  defaultPreferences,
  type Amenity,
  type Importance,
  type ProfileWrite,
  type PropertyType,
} from "@housing/shared";
import { Labeled, Section, Switch } from "../../components/ui.tsx";
import {
  hasLine,
  safeFromForm,
  toForm,
  toggleLine,
  type PreferencesForm,
} from "../../lib/prefs-form.ts";
import {
  useCampuses,
  useDeleteProfile,
  usePreviewProfile,
  useProfiles,
  useSaveProfile,
  useSettings,
  useTemplates,
} from "../../lib/queries.ts";
import { amenityLabel, propertyLabel, pluralize } from "../../lib/format.ts";
import { rejectReason } from "../../lib/reasons.ts";
import { useToast } from "../../lib/toast.tsx";

const IMPORTANCE: { value: Importance; label: string }[] = [
  { value: "must", label: "Must" },
  { value: "prefer", label: "Prefer" },
  { value: "avoid", label: "Avoid" },
  { value: "ignore", label: "Ignore" },
];

const COLORS: { value: string; name: string }[] = [
  { value: "#2563eb", name: "Blue" },
  { value: "#1e4d3f", name: "Green" },
  { value: "#a3452c", name: "Rust" },
  { value: "#7b4fa8", name: "Violet" },
  { value: "#146b78", name: "Teal" },
  { value: "#8a6b1f", name: "Ochre" },
  { value: "#b4365f", name: "Magenta" },
];
const DEFAULT_COLOR = COLORS[0]?.value ?? "#2563eb";

function AmenityControl({
  amenity,
  value,
  onChange,
}: {
  amenity: Amenity;
  value: Importance;
  onChange: (next: Importance) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="med mb-1.5 text-[13px]">{amenityLabel(amenity)}</legend>
      <div className="grid grid-cols-4 overflow-hidden rounded-[var(--radius-ctl)] border border-rule-strong">
        {IMPORTANCE.map((option, index) => {
          const active = value === option.value;
          return (
            <label
              key={option.value}
              className={`flex min-h-[44px] cursor-pointer items-center justify-center text-[12.5px] ${
                index > 0 ? "border-l border-rule" : ""
              } ${active ? "semi bg-moss text-moss-ink" : "text-ink-2 hover:bg-surface-2"}`}
            >
              <input
                type="radio"
                name={`amenity-${amenity}`}
                value={option.value}
                checked={active}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function WeightSlider({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <Labeled label={label} hint={hint}>
      {(props) => (
        <div className="flex items-center gap-3">
          <input
            {...props}
            type="range"
            min={0}
            max={5}
            step={1}
            value={value}
            onChange={(e) => onChange(Number(e.currentTarget.value))}
            className="flex-1"
          />
          <span className="num w-6 text-right text-[13px] text-ink-2">{value}</span>
        </div>
      )}
    </Labeled>
  );
}

export function ProfileEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: profiles } = useProfiles();
  const { data: settings } = useSettings();
  const { data: campuses } = useCampuses();
  const { data: templates } = useTemplates();
  const save = useSaveProfile();
  const remove = useDeleteProfile();
  const preview = usePreviewProfile();

  const creating = id === "new";
  const existing = creating ? undefined : profiles?.find((p) => p.id === id);
  const campus = campuses?.find((c) => c.id === settings?.campusId) ?? campuses?.[0];

  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [form, setForm] = useState<PreferencesForm | null>(null);
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    const key = existing?.id ?? (creating ? "new" : null);
    if (key === null || loadedFor.current === key) return;
    if (creating) {
      if (!campus) return;
      loadedFor.current = "new";
      setName("");
      setEnabled(true);
      setColor(DEFAULT_COLOR);
      setForm(toForm(defaultPreferences(campus.anchor)));
      return;
    }
    if (!existing) return;
    loadedFor.current = existing.id;
    setName(existing.name);
    setEnabled(existing.enabled);
    setColor(existing.color);
    setForm(toForm(existing.preferences));
  }, [creating, existing, campus]);

  const patch = <K extends keyof PreferencesForm>(key: K, value: PreferencesForm[K]) =>
    setForm((previous) => (previous ? { ...previous, [key]: value } : previous));

  const write = useMemo<ProfileWrite | null>(() => {
    if (!form) return null;
    const result = safeFromForm(form);
    if (!result.ok) return null;
    return { name: name || "Untitled profile", enabled, color, preferences: result.value };
  }, [form, name, enabled, color]);

  const previewMutate = preview.mutate;
  useEffect(() => {
    if (!write) return;
    const handle = window.setTimeout(() => previewMutate(write), 450);
    return () => window.clearTimeout(handle);
  }, [write, previewMutate]);

  if (!form) {
    return <p className="px-4 py-8 text-[13px] text-ink-2 lg:px-6">Loading the profile</p>;
  }

  const invalid = safeFromForm(form);

  return (
    <form
      className="pb-10"
      onSubmit={(event) => {
        event.preventDefault();
        const result = safeFromForm(form);
        if (!result.ok) {
          toast.push({ title: "Check the form", body: result.message, tone: "bad" });
          return;
        }
        if (name.trim() === "") {
          toast.push({ title: "Name the profile", body: "Give it a name you will recognise", tone: "bad" });
          return;
        }
        save.mutate(
          {
            id: creating ? null : (id ?? null),
            write: { name: name.trim(), enabled, color, preferences: result.value },
          },
          {
            onSuccess: (profile) => {
              toast.push({ title: "Saved", body: `${profile.name} is watching` });
              navigate("/settings");
            },
            onError: (error) =>
              toast.push({ title: "Not saved", body: error.message, tone: "bad" }),
          },
        );
      }}
    >
      <div className="sticky top-12 z-20 border-b border-rule bg-ground/95 px-4 py-3 backdrop-blur lg:top-0 lg:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="wide mr-auto text-[17px]">
            {creating ? "New profile" : `Edit ${existing?.name ?? "profile"}`}
          </h1>
          <button type="button" className="ctl med text-[13.5px]" onClick={() => navigate("/settings")}>
            Cancel
          </button>
          <button
            type="submit"
            className="ctl-primary semi px-4 text-[13.5px]"
            disabled={save.isPending}
          >
            {save.isPending ? "Saving" : "Save profile"}
          </button>
        </div>

        <div
          className="mt-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px]"
          data-testid="profile-preview"
          aria-live="polite"
        >
          {preview.data ? (
            <>
              <span className="num semi">
                {preview.data.matched} of {preview.data.total} current listings match
              </span>
              {preview.data.topRejectReasons.length > 0 ? (
                <span className="text-ink-2">
                  Most common rejections:{" "}
                  {preview.data.topRejectReasons
                    .slice(0, 3)
                    .map(([reason, count]) => `${rejectReason(reason).toLowerCase()} (${count})`)
                    .join(", ")}
                </span>
              ) : null}
            </>
          ) : preview.isPending ? (
            <span className="text-ink-2">Counting matches</span>
          ) : preview.isError ? (
            <span className="text-ink-2">The preview count is unavailable right now</span>
          ) : (
            <span className="text-ink-2">Edit anything to see how many listings would match</span>
          )}
        </div>
      </div>

      {invalid.ok ? null : (
        <p className="mx-4 mt-3 rounded-[8px] border border-brick bg-brick-soft px-3 py-2 text-[13px] lg:mx-6">
          {invalid.message}
        </p>
      )}

      <Section title="Name it" hint="The colour shows on every listing this profile matched.">
        <Labeled label="Profile name">
          {(props) => (
            <input
              {...props}
              className="field text-[14px]"
              value={name}
              placeholder="Row home for 6"
              onChange={(e) => setName(e.currentTarget.value)}
            />
          )}
        </Labeled>
        <fieldset>
          <legend className="med mb-2 text-[13px]">Colour</legend>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((option) => (
              <label
                key={option.value}
                className="flex h-11 w-11 cursor-pointer items-center justify-center"
              >
                <input
                  type="radio"
                  name="profile-color"
                  className="sr-only"
                  checked={color === option.value}
                  onChange={() => setColor(option.value)}
                />
                <span
                  className="block h-8 w-8 rounded-full"
                  style={{
                    background: option.value,
                    boxShadow:
                      color === option.value
                        ? "0 0 0 3px var(--ground), 0 0 0 5px var(--moss)"
                        : undefined,
                  }}
                />
                <span className="sr-only">{option.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Switch
          label="Watch with this profile"
          hint="Turn it off to keep the profile without scoring new listings against it."
          checked={enabled}
          onChange={setEnabled}
        />
      </Section>

      <Section title="Group and budget" hint="Per-person price is the total divided by your group size.">
        <Labeled label="People splitting rent">
          {(props) => (
            <input
              {...props}
              className="field num text-[14px]"
              type="number"
              min={1}
              value={form.groupSize}
              onChange={(e) => patch("groupSize", e.currentTarget.value)}
            />
          )}
        </Labeled>
        <div className="grid gap-3 sm:grid-cols-3">
          <Labeled label="Max total rent">
            {(props) => (
              <input
                {...props}
                className="field num text-[14px]"
                type="number"
                value={form.maxTotal}
                onChange={(e) => patch("maxTotal", e.currentTarget.value)}
              />
            )}
          </Labeled>
          <Labeled label="Max per person">
            {(props) => (
              <input
                {...props}
                className="field num text-[14px]"
                type="number"
                value={form.maxPerPerson}
                onChange={(e) => patch("maxPerPerson", e.currentTarget.value)}
              />
            )}
          </Labeled>
          <Labeled label="Ideal per person" hint="Scores best at or under this.">
            {(props) => (
              <input
                {...props}
                className="field num text-[14px]"
                type="number"
                value={form.idealPerPerson}
                onChange={(e) => patch("idealPerPerson", e.currentTarget.value)}
              />
            )}
          </Labeled>
        </div>
        <Switch
          label="Keep listings with no price"
          hint="Many landlord sites say call for price. Turning this off drops them all."
          checked={form.priceAllowUnknown}
          onChange={(v) => patch("priceAllowUnknown", v)}
        />
      </Section>

      <Section title="Size and type">
        <div className="grid gap-3 sm:grid-cols-4">
          <Labeled label="Bedrooms, min">
            {(props) => (
              <input
                {...props}
                className="field num text-[14px]"
                type="number"
                min={0}
                value={form.bedsMin}
                onChange={(e) => patch("bedsMin", e.currentTarget.value)}
              />
            )}
          </Labeled>
          <Labeled label="Bedrooms, max">
            {(props) => (
              <input
                {...props}
                className="field num text-[14px]"
                type="number"
                value={form.bedsMax}
                onChange={(e) => patch("bedsMax", e.currentTarget.value)}
              />
            )}
          </Labeled>
          <Labeled label="Bathrooms, min">
            {(props) => (
              <input
                {...props}
                className="field num text-[14px]"
                type="number"
                step="0.5"
                min={0}
                value={form.bathsMin}
                onChange={(e) => patch("bathsMin", e.currentTarget.value)}
              />
            )}
          </Labeled>
          <Labeled label="Square feet, min">
            {(props) => (
              <input
                {...props}
                className="field num text-[14px]"
                type="number"
                value={form.sqftMin}
                onChange={(e) => patch("sqftMin", e.currentTarget.value)}
              />
            )}
          </Labeled>
        </div>
        <Switch
          label="Keep listings with no bedroom count"
          checked={form.bedsAllowUnknown}
          onChange={(v) => patch("bedsAllowUnknown", v)}
        />
        <fieldset>
          <legend className="med mb-2 text-[13px]">Property types</legend>
          <div className="flex flex-wrap gap-2">
            {PROPERTY_TYPES.map((type: PropertyType) => {
              const on = form.propertyTypes.includes(type);
              return (
                <label
                  key={type}
                  className={`flex min-h-[44px] cursor-pointer items-center rounded-full border px-3 text-[13px] ${
                    on ? "semi border-transparent bg-moss-soft" : "border-rule text-ink-2"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={on}
                    onChange={() =>
                      patch(
                        "propertyTypes",
                        on
                          ? form.propertyTypes.filter((t) => t !== type)
                          : [...form.propertyTypes, type],
                      )
                    }
                  />
                  {propertyLabel(type)}
                </label>
              );
            })}
          </div>
        </fieldset>
      </Section>

      <Section title="Location" hint="Walk time is measured from the anchor below.">
        {campuses && campuses.length > 0 ? (
          <Labeled label="Anchor preset">
            {(props) => (
              <select
                {...props}
                className="field text-[14px]"
                value={
                  campuses.find((c) => c.anchor.label === form.anchorLabel)?.id ?? ""
                }
                onChange={(e) => {
                  const next = campuses.find((c) => c.id === e.currentTarget.value);
                  if (!next) return;
                  patch("anchorLabel", next.anchor.label);
                  patch("anchorLat", String(next.anchor.lat));
                  patch("anchorLon", String(next.anchor.lon));
                }}
              >
                <option value="">Custom</option>
                {campuses.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.anchor.label}
                  </option>
                ))}
              </select>
            )}
          </Labeled>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-3">
          <Labeled label="Anchor name">
            {(props) => (
              <input
                {...props}
                className="field text-[14px]"
                value={form.anchorLabel}
                onChange={(e) => patch("anchorLabel", e.currentTarget.value)}
              />
            )}
          </Labeled>
          <Labeled label="Latitude">
            {(props) => (
              <input
                {...props}
                className="field num text-[14px]"
                value={form.anchorLat}
                onChange={(e) => patch("anchorLat", e.currentTarget.value)}
              />
            )}
          </Labeled>
          <Labeled label="Longitude">
            {(props) => (
              <input
                {...props}
                className="field num text-[14px]"
                value={form.anchorLon}
                onChange={(e) => patch("anchorLon", e.currentTarget.value)}
              />
            )}
          </Labeled>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="Max walk, minutes">
            {(props) => (
              <input
                {...props}
                className="field num text-[14px]"
                type="number"
                value={form.maxWalkMinutes}
                onChange={(e) => patch("maxWalkMinutes", e.currentTarget.value)}
              />
            )}
          </Labeled>
          <Labeled label="Ideal walk, minutes">
            {(props) => (
              <input
                {...props}
                className="field num text-[14px]"
                type="number"
                value={form.idealWalkMinutes}
                onChange={(e) => patch("idealWalkMinutes", e.currentTarget.value)}
              />
            )}
          </Labeled>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="Only these neighborhoods" hint="One per line. Leave empty for any.">
            {(props) => (
              <textarea
                {...props}
                className="field text-[14px]"
                rows={3}
                value={form.neighborhoodsInclude}
                onChange={(e) => patch("neighborhoodsInclude", e.currentTarget.value)}
              />
            )}
          </Labeled>
          <Labeled label="Never these neighborhoods" hint="One per line.">
            {(props) => (
              <textarea
                {...props}
                className="field text-[14px]"
                rows={3}
                value={form.neighborhoodsExclude}
                onChange={(e) => patch("neighborhoodsExclude", e.currentTarget.value)}
              />
            )}
          </Labeled>
        </div>
        <Switch
          label="Keep listings that could not be placed on the map"
          checked={form.locationAllowUnknown}
          onChange={(v) => patch("locationAllowUnknown", v)}
        />
      </Section>

      <Section title="Dates">
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="Move in no earlier than">
            {(props) => (
              <input
                {...props}
                className="field text-[14px]"
                type="date"
                value={form.moveInEarliest}
                onChange={(e) => patch("moveInEarliest", e.currentTarget.value)}
              />
            )}
          </Labeled>
          <Labeled label="Move in no later than">
            {(props) => (
              <input
                {...props}
                className="field text-[14px]"
                type="date"
                value={form.moveInLatest}
                onChange={(e) => patch("moveInLatest", e.currentTarget.value)}
              />
            )}
          </Labeled>
          <Labeled label="Lease months, min">
            {(props) => (
              <input
                {...props}
                className="field num text-[14px]"
                type="number"
                value={form.leaseMonthsMin}
                onChange={(e) => patch("leaseMonthsMin", e.currentTarget.value)}
              />
            )}
          </Labeled>
          <Labeled label="Lease months, max">
            {(props) => (
              <input
                {...props}
                className="field num text-[14px]"
                type="number"
                value={form.leaseMonthsMax}
                onChange={(e) => patch("leaseMonthsMax", e.currentTarget.value)}
              />
            )}
          </Labeled>
        </div>
        <Switch
          label="Keep listings with no move-in date"
          checked={form.datesAllowUnknown}
          onChange={(v) => patch("datesAllowUnknown", v)}
        />
      </Section>

      <Section
        title="Amenities"
        hint="Must is a hard filter. Prefer lifts the score, avoid lowers it, ignore does neither."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {AMENITIES.map((amenity) => (
            <AmenityControl
              key={amenity}
              amenity={amenity}
              value={form.amenities[amenity] ?? "ignore"}
              onChange={(next) =>
                patch("amenities", { ...form.amenities, [amenity]: next })
              }
            />
          ))}
        </div>
      </Section>

      <Section title="Rules">
        <Switch label="Allow sublets" checked={form.allowSublets} onChange={(v) => patch("allowSublets", v)} />
        <Switch
          label="Allow a room in a shared unit"
          checked={form.allowRoomsInSharedUnit}
          onChange={(v) => patch("allowRoomsInSharedUnit", v)}
        />
        <Switch
          label="Allow income restricted housing"
          checked={form.allowIncomeRestricted}
          onChange={(v) => patch("allowIncomeRestricted", v)}
        />
        <Switch
          label="Allow senior housing"
          checked={form.allowSeniorHousing}
          onChange={(v) => patch("allowSeniorHousing", v)}
        />
        <Switch
          label="Hide suspected scams"
          hint="They are still scraped. Turn this off to see them with their warning."
          checked={form.hideSuspectedScams}
          onChange={(v) => patch("hideSuspectedScams", v)}
        />
        <Switch
          label="Require photos"
          checked={form.requirePhotos}
          onChange={(v) => patch("requirePhotos", v)}
        />
        <Labeled label="Drop listings older than, in days" hint="Leave empty for no age limit.">
          {(props) => (
            <input
              {...props}
              className="field num text-[14px]"
              type="number"
              value={form.maxListingAgeDays}
              onChange={(e) => patch("maxListingAgeDays", e.currentTarget.value)}
            />
          )}
        </Labeled>
      </Section>

      <Section title="Exclusions" hint="One per line. Matched against the title, description, address and landlord.">
        {campus && campus.knownBuildings.length > 0 ? (
          <fieldset>
            <legend className="med mb-2 text-[13px]">
              Big buildings near {campus.anchor.label}
            </legend>
            <div className="flex flex-wrap gap-2">
              {campus.knownBuildings.map((building) => {
                const on = hasLine(form.excludeBuildings, building.name);
                return (
                  <label
                    key={building.name}
                    className={`flex min-h-[44px] cursor-pointer items-center rounded-full border px-3 text-[13px] ${
                      on ? "semi border-transparent bg-brick-soft text-brick" : "border-rule text-ink-2"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={on}
                      onChange={() =>
                        patch("excludeBuildings", toggleLine(form.excludeBuildings, building.name))
                      }
                    />
                    {building.name}
                  </label>
                );
              })}
            </div>
            <p className="mt-2 text-[12px] text-ink-2">
              Tap one to keep it out of the feed. These are the large managed buildings most
              students already know about.
            </p>
          </fieldset>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="Buildings">
            {(props) => (
              <textarea
                {...props}
                className="field text-[14px]"
                rows={3}
                value={form.excludeBuildings}
                onChange={(e) => patch("excludeBuildings", e.currentTarget.value)}
              />
            )}
          </Labeled>
          <Labeled label="Addresses">
            {(props) => (
              <textarea
                {...props}
                className="field text-[14px]"
                rows={3}
                value={form.excludeAddresses}
                onChange={(e) => patch("excludeAddresses", e.currentTarget.value)}
              />
            )}
          </Labeled>
          <Labeled label="Landlords">
            {(props) => (
              <textarea
                {...props}
                className="field text-[14px]"
                rows={3}
                value={form.excludeLandlords}
                onChange={(e) => patch("excludeLandlords", e.currentTarget.value)}
              />
            )}
          </Labeled>
          <Labeled label="Words">
            {(props) => (
              <textarea
                {...props}
                className="field text-[14px]"
                rows={3}
                value={form.excludeKeywords}
                onChange={(e) => patch("excludeKeywords", e.currentTarget.value)}
              />
            )}
          </Labeled>
          <Labeled label="Sources" hint="Source ids, such as craigslist.">
            {(props) => (
              <textarea
                {...props}
                className="field text-[14px]"
                rows={3}
                value={form.excludeSources}
                onChange={(e) => patch("excludeSources", e.currentTarget.value)}
              />
            )}
          </Labeled>
        </div>
      </Section>

      <Section title="Keywords">
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="Must appear" hint="One per line. A listing missing any of these is dropped.">
            {(props) => (
              <textarea
                {...props}
                className="field text-[14px]"
                rows={3}
                value={form.keywordsRequired}
                onChange={(e) => patch("keywordsRequired", e.currentTarget.value)}
              />
            )}
          </Labeled>
          <Labeled label="Nice to see" hint="Each one found lifts the score a little.">
            {(props) => (
              <textarea
                {...props}
                className="field text-[14px]"
                rows={3}
                value={form.keywordsBoost}
                onChange={(e) => patch("keywordsBoost", e.currentTarget.value)}
              />
            )}
          </Labeled>
        </div>
      </Section>

      <Section title="What the score weighs" hint="Only the ratios matter. Zero drops a component entirely.">
        <WeightSlider
          label="Price"
          hint="How much cheaper rent lifts the score."
          value={form.weightPrice}
          onChange={(v) => patch("weightPrice", v)}
        />
        <WeightSlider
          label="Distance"
          hint="How much a short walk lifts the score."
          value={form.weightDistance}
          onChange={(v) => patch("weightDistance", v)}
        />
        <WeightSlider
          label="Amenities"
          hint="How much your prefer and avoid list counts."
          value={form.weightAmenities}
          onChange={(v) => patch("weightAmenities", v)}
        />
        <WeightSlider
          label="Size"
          hint="Extra bedrooms past your minimum cost rent, so they score lower."
          value={form.weightSize}
          onChange={(v) => patch("weightSize", v)}
        />
        <WeightSlider
          label="Freshness"
          hint="How much a listing posted minutes ago beats one from last week."
          value={form.weightFreshness}
          onChange={(v) => patch("weightFreshness", v)}
        />
      </Section>

      <Section title="Notifications" hint="Your topic is a secret. Anyone who knows it can read your pushes.">
        <Switch
          label="Push matches to my phone"
          checked={form.notifyEnabled}
          onChange={(v) => patch("notifyEnabled", v)}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="My ntfy topic" hint="Pushes here carry the send button.">
            {(props) => (
              <input
                {...props}
                className="field text-[14px]"
                value={form.notifyTopic}
                onChange={(e) => patch("notifyTopic", e.currentTarget.value)}
              />
            )}
          </Labeled>
          <Labeled label="Roommate topic" hint="Same pushes, no send button. Leave empty to skip.">
            {(props) => (
              <input
                {...props}
                className="field text-[14px]"
                value={form.notifyShareTopic}
                onChange={(e) => patch("notifyShareTopic", e.currentTarget.value)}
              />
            )}
          </Labeled>
        </div>
        <Labeled
          label={`Push when the score is at least ${form.notifyMinScore}`}
          hint="Lower means more pushes."
        >
          {(props) => (
            <input
              {...props}
              type="range"
              min={0}
              max={100}
              value={form.notifyMinScore}
              onChange={(e) => patch("notifyMinScore", Number(e.currentTarget.value))}
            />
          )}
        </Labeled>
        <Labeled
          label={`Break through Do Not Disturb at ${form.notifyUrgentScore}`}
          hint="These go out at the highest ntfy priority."
        >
          {(props) => (
            <input
              {...props}
              type="range"
              min={0}
              max={100}
              value={form.notifyUrgentScore}
              onChange={(e) => patch("notifyUrgentScore", Number(e.currentTarget.value))}
            />
          )}
        </Labeled>
        <Switch
          label="Tell me about price drops"
          checked={form.notifyPriceDrops}
          onChange={(v) => patch("notifyPriceDrops", v)}
        />
        <Switch
          label="Tell me when a listing comes back"
          checked={form.notifyBackOnMarket}
          onChange={(v) => patch("notifyBackOnMarket", v)}
        />
        <Switch
          label="Hold pushes overnight"
          hint="Anything held goes out as one digest when the window ends."
          checked={form.quietHoursEnabled}
          onChange={(v) => patch("quietHoursEnabled", v)}
        />
        {form.quietHoursEnabled ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label="Quiet from">
              {(props) => (
                <input
                  {...props}
                  className="field num text-[14px]"
                  type="time"
                  value={form.quietStart}
                  onChange={(e) => patch("quietStart", e.currentTarget.value)}
                />
              )}
            </Labeled>
            <Labeled label="Quiet until">
              {(props) => (
                <input
                  {...props}
                  className="field num text-[14px]"
                  type="time"
                  value={form.quietEnd}
                  onChange={(e) => patch("quietEnd", e.currentTarget.value)}
                />
              )}
            </Labeled>
          </div>
        ) : null}
      </Section>

      <Section title="Outreach">
        <Switch
          label="Write a draft for strong matches"
          hint="The draft is staged, never sent on its own."
          checked={form.outreachAutoDraft}
          onChange={(v) => patch("outreachAutoDraft", v)}
        />
        <Labeled label="Template">
          {(props) => (
            <select
              {...props}
              className="field text-[14px]"
              value={form.outreachTemplateId}
              onChange={(e) => patch("outreachTemplateId", e.currentTarget.value)}
            >
              <option value="">Use the default template</option>
              {(templates ?? []).map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          )}
        </Labeled>
        <Labeled label={`Draft when the score is at least ${form.outreachMinScore}`}>
          {(props) => (
            <input
              {...props}
              type="range"
              min={0}
              max={100}
              value={form.outreachMinScore}
              onChange={(e) => patch("outreachMinScore", Number(e.currentTarget.value))}
            />
          )}
        </Labeled>
      </Section>

      {creating ? null : (
        <Section title="Remove" hint="This deletes the profile and its match history. Listings stay.">
          <div>
            <button
              type="button"
              className="ctl med text-[13.5px] text-brick"
              disabled={remove.isPending}
              onClick={() => {
                if (!id) return;
                remove.mutate(id, {
                  onSuccess: () => {
                    toast.push({ title: "Profile deleted" });
                    navigate("/settings");
                  },
                });
              }}
            >
              Delete this profile
            </button>
          </div>
        </Section>
      )}

      <p className="px-4 pt-2 text-[12px] text-ink-3 lg:px-6">
        {pluralize(form.propertyTypes.length, "property type", "property types")} selected. Saving
        re-scores every active listing, which takes a moment.
      </p>
    </form>
  );
}
