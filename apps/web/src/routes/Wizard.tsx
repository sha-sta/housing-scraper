import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  PROPERTY_TYPES,
  defaultPreferences,
  type CampusPreset,
  type ComposeVia,
  type Identity,
  type Profile,
  type PropertyType,
} from "@housing/shared";
import { QrCode } from "../components/QrCode.tsx";
import { Labeled } from "../components/ui.tsx";
import { api } from "../lib/api.ts";
import { useCampuses, useSaveProfile, useSettings, useUpdateSettings } from "../lib/queries.ts";
import { useCopy } from "../lib/clipboard.ts";
import { composeHint, composeLabel, propertyLabel, suggestComposeVia } from "../lib/format.ts";
import { randomTopic, subscribeUrl } from "../lib/topic.ts";
import { useToast } from "../lib/toast.tsx";

const STEPS = ["Campus", "You", "Your search", "Your phone", "Done"];
const VIA_OPTIONS: ComposeVia[] = ["outlook", "mailto", "gmail"];

interface SearchDraft {
  name: string;
  groupSize: string;
  bedsMin: string;
  maxPerPerson: string;
  maxWalkMinutes: string;
  moveInEarliest: string;
  moveInLatest: string;
  propertyTypes: PropertyType[];
  excludedBuildings: string[];
}

const SEARCH_DEFAULTS: SearchDraft = {
  name: "",
  groupSize: "4",
  bedsMin: "4",
  maxPerPerson: "900",
  maxWalkMinutes: "15",
  moveInEarliest: "",
  moveInLatest: "",
  propertyTypes: ["apartment", "rowhome", "house", "condo", "unknown"],
  excludedBuildings: [],
};

function StepBar({ step }: { step: number }) {
  return (
    <ol className="flex gap-1.5 px-4 pt-4 lg:px-8" aria-label="Setup steps">
      {STEPS.map((name, index) => (
        <li key={name} className="flex-1">
          <span
            aria-hidden="true"
            className="block h-[3px] rounded-full"
            style={{ background: index <= step ? "var(--moss)" : "var(--rule)" }}
          />
          <span
            className={`mt-1.5 block text-[11px] ${index === step ? "semi text-ink" : "text-ink-3"}`}
            aria-current={index === step ? "step" : undefined}
          >
            {name}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function Wizard() {
  const navigate = useNavigate();
  const toast = useToast();
  const settings = useSettings();
  const { data: campuses } = useCampuses();
  const updateSettings = useUpdateSettings();
  const saveProfile = useSaveProfile();
  const { copied, copy } = useCopy();

  const [step, setStep] = useState(0);
  const [campusId, setCampusId] = useState("");
  const [identity, setIdentity] = useState<Identity>({
    fullName: "",
    email: "",
    phone: "",
    school: "",
    blurb: "",
  });
  const [composeVia, setComposeVia] = useState<ComposeVia>("mailto");
  const [viaTouched, setViaTouched] = useState(false);
  const [search, setSearch] = useState<SearchDraft>(SEARCH_DEFAULTS);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [topic, setTopic] = useState(() => randomTopic());
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    if (campusId === "" && campuses && campuses.length > 0) {
      setCampusId(settings.data?.campusId ?? campuses[0]?.id ?? "");
    }
  }, [campuses, campusId, settings.data]);

  useEffect(() => {
    if (viaTouched) return;
    setComposeVia(suggestComposeVia(identity.email));
  }, [identity.email, viaTouched]);

  const campus = useMemo<CampusPreset | undefined>(
    () => campuses?.find((c) => c.id === campusId),
    [campuses, campusId],
  );

  const server = settings.data?.ntfyServer || "https://ntfy.sh";
  const url = subscribeUrl(server, topic);

  function buildProfile() {
    if (!campus) return null;
    const base = defaultPreferences(campus.anchor);
    return {
      name: search.name.trim() || "My search",
      enabled: true,
      color: "#1e4d3f",
      preferences: {
        ...base,
        group: { size: Math.max(1, Number(search.groupSize) || 1) },
        price: {
          ...base.price,
          maxPerPerson: Number(search.maxPerPerson) || null,
          idealPerPerson: Number(search.maxPerPerson)
            ? Math.round(Number(search.maxPerPerson) * 0.8)
            : null,
        },
        beds: { ...base.beds, min: Number(search.bedsMin) || 0 },
        propertyTypes: search.propertyTypes,
        location: {
          ...base.location,
          maxWalkMinutes: Number(search.maxWalkMinutes) || null,
          idealWalkMinutes: Math.max(
            5,
            Math.round((Number(search.maxWalkMinutes) || 15) * 0.6),
          ),
        },
        dates: {
          ...base.dates,
          moveInEarliest: search.moveInEarliest || null,
          moveInLatest: search.moveInLatest || null,
        },
        exclusions: { ...base.exclusions, buildings: search.excludedBuildings },
        notify: { ...base.notify, topic },
      },
    };
  }

  async function test() {
    if (!profile) return;
    setTesting(true);
    setTestResult(null);
    try {
      const outcome = await api.testNtfy(profile.id);
      setTestResult(outcome.ok ? "Sent. Check your phone." : (outcome.error ?? "No reason given"));
    } catch (error) {
      setTestResult(error instanceof Error ? error.message : "The server did not answer");
    } finally {
      setTesting(false);
    }
  }

  const canAdvance =
    step === 0
      ? campusId !== ""
      : step === 1
        ? identity.fullName.trim() !== "" && identity.email.trim() !== ""
        : step === 2
          ? search.propertyTypes.length > 0
          : true;

  function advance() {
    if (step === 0) {
      updateSettings.mutate({ campusId });
      setStep(1);
      return;
    }
    if (step === 1) {
      updateSettings.mutate({ identity, composeVia });
      setStep(2);
      return;
    }
    if (step === 2) {
      const write = buildProfile();
      if (!write) return;
      saveProfile.mutate(
        { id: profile?.id ?? null, write },
        {
          onSuccess: (created) => {
            setProfile(created);
            setStep(3);
          },
          onError: (error) =>
            toast.push({ title: "Could not save the search", body: error.message, tone: "bad" }),
        },
      );
      return;
    }
    if (step === 3) {
      setStep(4);
      return;
    }
    updateSettings.mutate(
      { setupComplete: true },
      {
        onSuccess: () => navigate("/"),
        onError: (error) =>
          toast.push({ title: "Could not finish setup", body: error.message, tone: "bad" }),
      },
    );
  }

  return (
    <div className="mx-auto min-h-dvh max-w-[720px] pb-10">
      <StepBar step={step} />

      <div className="px-4 pt-6 lg:px-8">
        {step === 0 ? (
          <section>
            <h1 className="wide text-[22px] leading-tight">Where are you studying?</h1>
            <p className="mt-1.5 max-w-[52ch] text-[13.5px] text-ink-2">
              Walk time is measured from here, and the app searches the neighborhoods around it.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {(campuses ?? []).map((option) => (
                <label
                  key={option.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-[var(--radius-ctl)] border px-3 py-3 ${
                    campusId === option.id ? "border-moss bg-moss-soft" : "border-rule"
                  }`}
                >
                  <input
                    type="radio"
                    name="campus"
                    className="mt-[3px]"
                    checked={campusId === option.id}
                    onChange={() => setCampusId(option.id)}
                  />
                  <span>
                    <span className="med block text-[14px]">{option.anchor.label}</span>
                    <span className="mt-0.5 block text-[12.5px] text-ink-2">
                      {option.neighborhoods.slice(0, 4).join(", ")}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </section>
        ) : null}

        {step === 1 ? (
          <section className="flex flex-col gap-3.5">
            <h1 className="wide text-[22px] leading-tight">Who is writing?</h1>
            <p className="-mt-2 max-w-[52ch] text-[13.5px] text-ink-2">
              Drafts sign off with these, so a landlord sees a real student.
            </p>
            <Labeled label="Full name">
              {(props) => (
                <input
                  {...props}
                  className="field text-[15px]"
                  value={identity.fullName}
                  onChange={(e) => setIdentity({ ...identity, fullName: e.currentTarget.value })}
                />
              )}
            </Labeled>
            <Labeled label="Email" hint="Use your school address. Landlords answer those faster.">
              {(props) => (
                <input
                  {...props}
                  className="field text-[15px]"
                  type="email"
                  value={identity.email}
                  onChange={(e) => setIdentity({ ...identity, email: e.currentTarget.value })}
                />
              )}
            </Labeled>
            <Labeled label="Phone">
              {(props) => (
                <input
                  {...props}
                  className="field text-[15px]"
                  type="tel"
                  value={identity.phone}
                  onChange={(e) => setIdentity({ ...identity, phone: e.currentTarget.value })}
                />
              )}
            </Labeled>
            <Labeled label="School and year">
              {(props) => (
                <input
                  {...props}
                  className="field text-[15px]"
                  placeholder="Johns Hopkins University, Class of 2028"
                  value={identity.school}
                  onChange={(e) => setIdentity({ ...identity, school: e.currentTarget.value })}
                />
              )}
            </Labeled>
            <fieldset className="mt-1">
              <legend className="med mb-2 text-[13px]">Where drafts open</legend>
              <div className="flex flex-col gap-2">
                {VIA_OPTIONS.map((option) => (
                  <label
                    key={option}
                    className={`flex cursor-pointer items-start gap-3 rounded-[var(--radius-ctl)] border px-3 py-2.5 ${
                      composeVia === option ? "border-moss bg-moss-soft" : "border-rule"
                    }`}
                  >
                    <input
                      type="radio"
                      name="wizard-compose"
                      className="mt-[3px]"
                      checked={composeVia === option}
                      onChange={() => {
                        setViaTouched(true);
                        setComposeVia(option);
                      }}
                    />
                    <span className="min-w-0">
                      <span className="med block text-[13.5px]">{composeLabel(option)}</span>
                      <span className="mt-0.5 block text-[12.5px] text-ink-2">
                        {composeHint(option)}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="flex flex-col gap-3.5">
            <h1 className="wide text-[22px] leading-tight">What are you looking for?</h1>
            <p className="-mt-2 max-w-[52ch] text-[13.5px] text-ink-2">
              You can change all of this later, and add more searches.
            </p>
            <Labeled label="Name this search">
              {(props) => (
                <input
                  {...props}
                  className="field text-[15px]"
                  placeholder="Row home for 6"
                  value={search.name}
                  onChange={(e) => setSearch({ ...search, name: e.currentTarget.value })}
                />
              )}
            </Labeled>
            <div className="grid grid-cols-2 gap-3">
              <Labeled label="People">
                {(props) => (
                  <input
                    {...props}
                    className="field num text-[15px]"
                    type="number"
                    min={1}
                    value={search.groupSize}
                    onChange={(e) => setSearch({ ...search, groupSize: e.currentTarget.value })}
                  />
                )}
              </Labeled>
              <Labeled label="Bedrooms, at least">
                {(props) => (
                  <input
                    {...props}
                    className="field num text-[15px]"
                    type="number"
                    min={0}
                    value={search.bedsMin}
                    onChange={(e) => setSearch({ ...search, bedsMin: e.currentTarget.value })}
                  />
                )}
              </Labeled>
              <Labeled label="Max per person">
                {(props) => (
                  <input
                    {...props}
                    className="field num text-[15px]"
                    type="number"
                    value={search.maxPerPerson}
                    onChange={(e) => setSearch({ ...search, maxPerPerson: e.currentTarget.value })}
                  />
                )}
              </Labeled>
              <Labeled label="Walk, max minutes">
                {(props) => (
                  <input
                    {...props}
                    className="field num text-[15px]"
                    type="number"
                    value={search.maxWalkMinutes}
                    onChange={(e) =>
                      setSearch({ ...search, maxWalkMinutes: e.currentTarget.value })
                    }
                  />
                )}
              </Labeled>
              <Labeled label="Move in from">
                {(props) => (
                  <input
                    {...props}
                    className="field text-[15px]"
                    type="date"
                    value={search.moveInEarliest}
                    onChange={(e) =>
                      setSearch({ ...search, moveInEarliest: e.currentTarget.value })
                    }
                  />
                )}
              </Labeled>
              <Labeled label="Move in by">
                {(props) => (
                  <input
                    {...props}
                    className="field text-[15px]"
                    type="date"
                    value={search.moveInLatest}
                    onChange={(e) => setSearch({ ...search, moveInLatest: e.currentTarget.value })}
                  />
                )}
              </Labeled>
            </div>

            <fieldset>
              <legend className="med mb-2 text-[13px]">Property types</legend>
              <div className="flex flex-wrap gap-2">
                {PROPERTY_TYPES.map((type) => {
                  const on = search.propertyTypes.includes(type);
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
                          setSearch({
                            ...search,
                            propertyTypes: on
                              ? search.propertyTypes.filter((t) => t !== type)
                              : [...search.propertyTypes, type],
                          })
                        }
                      />
                      {propertyLabel(type)}
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {campus && campus.knownBuildings.length > 0 ? (
              <fieldset>
                <legend className="med mb-1 text-[13px]">Buildings to keep out</legend>
                <p className="mb-2 text-[12.5px] text-ink-2">
                  The big managed buildings near {campus.anchor.label}. Tick the ones you already
                  know you do not want.
                </p>
                <div className="flex flex-wrap gap-2">
                  {campus.knownBuildings.map((building) => {
                    const on = search.excludedBuildings.includes(building.name);
                    return (
                      <label
                        key={building.name}
                        className={`flex min-h-[44px] cursor-pointer items-center rounded-full border px-3 text-[13px] ${
                          on
                            ? "semi border-transparent bg-brick-soft text-brick"
                            : "border-rule text-ink-2"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={on}
                          onChange={() =>
                            setSearch({
                              ...search,
                              excludedBuildings: on
                                ? search.excludedBuildings.filter((b) => b !== building.name)
                                : [...search.excludedBuildings, building.name],
                            })
                          }
                        />
                        {building.name}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}
          </section>
        ) : null}

        {step === 3 ? (
          <section>
            <h1 className="wide text-[22px] leading-tight">Get it on your phone</h1>
            <p className="mt-1.5 max-w-[52ch] text-[13.5px] text-ink-2">
              Install the ntfy app, scan this code, and tap subscribe. That is the whole setup.
            </p>

            <div className="mt-4 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <QrCode value={url} size={168} label={`Subscribe to ${topic}`} />
              <div className="min-w-0 flex-1">
                <p className="med text-[13px]">Your private topic</p>
                <p className="num mt-1 break-all text-[13px] text-ink-2">{topic}</p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="ctl med text-[13.5px]"
                    onClick={() => void copy("url", url)}
                  >
                    {copied === "url" ? "Copied" : "Copy the link"}
                  </button>
                  <button
                    type="button"
                    className="ctl med text-[13.5px]"
                    onClick={() => setTopic(randomTopic())}
                  >
                    Generate a new one
                  </button>
                </div>
                <p className="mt-2 text-[12px] text-ink-3">
                  Anyone with this topic can read your pushes, so keep it to yourself.
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="ctl-primary semi px-4 text-[13.5px]"
                disabled={testing || !profile}
                onClick={() => void test()}
                data-testid="wizard-test-push"
              >
                {testing ? "Sending" : "Send a test push"}
              </button>
              {testResult ? <span className="text-[13px] text-ink-2">{testResult}</span> : null}
            </div>
          </section>
        ) : null}

        {step === 4 ? (
          <section>
            <h1 className="wide text-[22px] leading-tight">You are watching</h1>
            <p className="mt-1.5 max-w-[52ch] text-[13.5px] text-ink-2">
              Sources start on their own schedule. The feed fills as they run, and your phone buzzes
              when something scores above your minimum.
            </p>
            <ul className="mt-4 flex flex-col gap-2 text-[13.5px]">
              <li className="rounded-[8px] border border-rule px-3 py-2.5">
                Open Sources to run one right now instead of waiting.
              </li>
              <li className="rounded-[8px] border border-rule px-3 py-2.5">
                Turn on Show everything scraped in the feed to see what was rejected and why.
              </li>
              <li className="rounded-[8px] border border-rule px-3 py-2.5">
                Settings has the full editor if you want to tune the score.
              </li>
              <li className="rounded-[8px] border border-rule px-3 py-2.5">
                Your pushes and their links already work on your phone. To open the whole
                dashboard there too, see{" "}
                <Link to="/settings/ntfy" className="med text-moss underline">
                  Open on your phone
                </Link>{" "}
                under Phone pushes.
              </li>
            </ul>
          </section>
        ) : null}
      </div>

      <div className="mt-8 flex items-center gap-2 px-4 lg:px-8">
        {step > 0 ? (
          <button
            type="button"
            className="ctl med text-[14px]"
            onClick={() => setStep((value) => Math.max(0, value - 1))}
          >
            Back
          </button>
        ) : null}
        <button
          type="button"
          className="ctl-primary semi ml-auto px-5 text-[14px]"
          disabled={!canAdvance || saveProfile.isPending || updateSettings.isPending}
          onClick={advance}
          data-testid="wizard-next"
        >
          {step === 4 ? "Open the feed" : step === 2 ? "Save and continue" : "Continue"}
        </button>
      </div>
    </div>
  );
}
