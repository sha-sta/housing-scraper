import { useEffect, useState } from "react";
import type { ComposeVia, Identity as IdentityValue } from "@housing/shared";
import { Labeled, PageHeader, Section, Spinner } from "../../components/ui.tsx";
import { useCampuses, useSettings, useUpdateSettings } from "../../lib/queries.ts";
import { composeHint, composeLabel } from "../../lib/format.ts";
import { useToast } from "../../lib/toast.tsx";

const VIA_OPTIONS: ComposeVia[] = ["outlook", "mailto", "gmail"];

export function Identity() {
  const settings = useSettings();
  const { data: campuses } = useCampuses();
  const update = useUpdateSettings();
  const toast = useToast();

  const [identity, setIdentity] = useState<IdentityValue | null>(null);
  const [campusId, setCampusId] = useState("");
  const [composeVia, setComposeVia] = useState<ComposeVia>("mailto");
  const [dashboardUrl, setDashboardUrl] = useState("");

  useEffect(() => {
    if (!settings.data) return;
    setIdentity(settings.data.identity);
    setCampusId(settings.data.campusId);
    setComposeVia(settings.data.composeVia);
    setDashboardUrl(settings.data.dashboardUrl);
  }, [settings.data]);

  if (settings.isPending || !identity) return <Spinner label="Loading your details" />;

  const set = <K extends keyof IdentityValue>(key: K, value: IdentityValue[K]) =>
    setIdentity((previous) => (previous ? { ...previous, [key]: value } : previous));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        update.mutate(
          { identity, campusId, composeVia, dashboardUrl },
          {
            onSuccess: () => toast.push({ title: "Saved" }),
            onError: (error) =>
              toast.push({ title: "Not saved", body: error.message, tone: "bad" }),
          },
        );
      }}
      className="pb-10"
    >
      <PageHeader
        title="You"
        hint="Drafts use these details, so a landlord sees a real student and not a form letter."
        actions={
          <button type="submit" className="ctl-primary semi px-4 text-[13.5px]" disabled={update.isPending}>
            {update.isPending ? "Saving" : "Save"}
          </button>
        }
      />

      <Section title="Your details">
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="Full name">
            {(props) => (
              <input
                {...props}
                className="field text-[14px]"
                value={identity.fullName}
                onChange={(e) => set("fullName", e.currentTarget.value)}
              />
            )}
          </Labeled>
          <Labeled label="Email" hint="The address landlords will reply to.">
            {(props) => (
              <input
                {...props}
                className="field text-[14px]"
                type="email"
                value={identity.email}
                onChange={(e) => set("email", e.currentTarget.value)}
              />
            )}
          </Labeled>
          <Labeled label="Phone">
            {(props) => (
              <input
                {...props}
                className="field text-[14px]"
                type="tel"
                value={identity.phone}
                onChange={(e) => set("phone", e.currentTarget.value)}
              />
            )}
          </Labeled>
          <Labeled label="School and year">
            {(props) => (
              <input
                {...props}
                className="field text-[14px]"
                placeholder="Johns Hopkins University, Class of 2028"
                value={identity.school}
                onChange={(e) => set("school", e.currentTarget.value)}
              />
            )}
          </Labeled>
        </div>
        <Labeled
          label="How you introduce the group"
          hint="Two or three sentences. Landlords answer specifics faster than a form letter."
        >
          {(props) => (
            <textarea
              {...props}
              className="field text-[14px]"
              rows={4}
              placeholder="Four juniors at Hopkins, no pets, all with guarantors, looking for a 12 month lease starting in June."
              value={identity.blurb}
              onChange={(e) => set("blurb", e.currentTarget.value)}
            />
          )}
        </Labeled>
      </Section>

      <Section
        title="Send from"
        hint="The app never holds your mailbox password. It opens a prefilled message and you press send."
      >
        <fieldset>
          <legend className="sr-only">Where to open a draft</legend>
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
                  name="compose-via"
                  className="mt-[3px]"
                  value={option}
                  checked={composeVia === option}
                  onChange={() => setComposeVia(option)}
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
      </Section>

      <Section title="Where you are looking">
        <Labeled label="Campus" hint="Sets the default anchor and the building list a new profile offers.">
          {(props) => (
            <select
              {...props}
              className="field text-[14px]"
              value={campusId}
              onChange={(e) => setCampusId(e.currentTarget.value)}
            >
              {(campuses ?? []).map((campus) => (
                <option key={campus.id} value={campus.id}>
                  {campus.anchor.label}
                </option>
              ))}
            </select>
          )}
        </Labeled>
        <Labeled
          label="Dashboard address"
          hint="The address a push opens. Use your Tailscale hostname if you want it to work off your network."
        >
          {(props) => (
            <input
              {...props}
              className="field text-[14px]"
              value={dashboardUrl}
              placeholder="http://localhost:4747"
              onChange={(e) => setDashboardUrl(e.currentTarget.value)}
            />
          )}
        </Labeled>
      </Section>
    </form>
  );
}
