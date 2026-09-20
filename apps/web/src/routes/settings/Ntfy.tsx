import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { Profile } from "@housing/shared";
import { PhoneAccess } from "../../components/PhoneAccess.tsx";
import { QrCode } from "../../components/QrCode.tsx";
import { Chip, Empty, Labeled, PageHeader, Section, Spinner } from "../../components/ui.tsx";
import { api } from "../../lib/api.ts";
import { useProfiles, useSaveProfile, useSettings, useUpdateSettings } from "../../lib/queries.ts";
import { useCopy } from "../../lib/clipboard.ts";
import { randomTopic, subscribeUrl } from "../../lib/topic.ts";
import { useToast } from "../../lib/toast.tsx";

function ProfileTopic({ profile, server }: { profile: Profile; server: string }) {
  const save = useSaveProfile();
  const toast = useToast();
  const { copied, copy } = useCopy();
  const [topic, setTopic] = useState(profile.preferences.notify.topic);
  const [testing, setTesting] = useState(false);
  useEffect(() => setTopic(profile.preferences.notify.topic), [profile.preferences.notify.topic]);

  const dirty = topic !== profile.preferences.notify.topic;
  const url = topic ? subscribeUrl(server, topic) : "";

  function persist(next: string) {
    save.mutate(
      {
        id: profile.id,
        write: {
          name: profile.name,
          enabled: profile.enabled,
          color: profile.color,
          preferences: {
            ...profile.preferences,
            notify: { ...profile.preferences.notify, topic: next },
          },
        },
      },
      {
        onSuccess: () => toast.push({ title: "Topic saved", body: profile.name }),
        onError: (error) => toast.push({ title: "Not saved", body: error.message, tone: "bad" }),
      },
    );
  }

  async function test() {
    setTesting(true);
    try {
      const result = await api.testNtfy(profile.id);
      if (result.ok) {
        toast.push({ title: "Test push sent", body: "Check your phone" });
      } else {
        toast.push({ title: "Push failed", body: result.error ?? "No reason given", tone: "bad" });
      }
    } catch (error) {
      toast.push({
        title: "Push failed",
        body: error instanceof Error ? error.message : "The server did not answer",
        tone: "bad",
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="border-t border-rule px-4 py-5 lg:px-6" data-testid="ntfy-profile">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: profile.color }}
        />
        <h3 className="semi text-[15px]">{profile.name}</h3>
        {profile.preferences.notify.enabled ? null : <Chip tone="quiet">Pushes off</Chip>}
      </div>

      <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-6">
        <div className="min-w-0 flex-1 flex flex-col gap-3">
          <Labeled label="Topic" hint="Treat it like a password. Anyone with it can read your pushes.">
            {(props) => (
              <input
                {...props}
                className="field text-[14px]"
                value={topic}
                placeholder="housing-abc123"
                onChange={(e) => setTopic(e.currentTarget.value)}
              />
            )}
          </Labeled>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="ctl med text-[13.5px]"
              onClick={() => setTopic(randomTopic())}
            >
              Generate a random topic
            </button>
            <button
              type="button"
              className="ctl-primary semi px-4 text-[13.5px]"
              disabled={!dirty || save.isPending}
              onClick={() => persist(topic)}
            >
              {save.isPending ? "Saving" : "Save topic"}
            </button>
            <button
              type="button"
              className="ctl med text-[13.5px]"
              disabled={testing || topic === "" || dirty}
              onClick={() => void test()}
              data-testid={`test-push-${profile.id}`}
            >
              {testing ? "Sending" : "Send a test push"}
            </button>
          </div>

          {url ? (
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={url}
                target="_blank"
                rel="noreferrer noopener"
                className="med break-all text-[13px] text-moss"
              >
                {url}
              </a>
              <button
                type="button"
                className="med min-h-[44px] px-2 text-[12.5px] text-ink-2 hover:text-ink"
                onClick={() => void copy("url", url)}
              >
                {copied === "url" ? "Copied" : "Copy link"}
              </button>
            </div>
          ) : null}

          {dirty ? (
            <p className="text-[12.5px] text-ink-2">Save the topic before sending a test push.</p>
          ) : null}
        </div>

        {url ? (
          <div className="flex shrink-0 flex-col items-center gap-1.5">
            <QrCode value={url} label={`Subscribe to ${topic} in the ntfy app`} />
            <p className="max-w-[160px] text-center text-[11.5px] text-ink-2">
              Scan it with your phone, then tap subscribe in the ntfy app.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function Ntfy() {
  const settings = useSettings();
  const profiles = useProfiles();
  const update = useUpdateSettings();
  const toast = useToast();
  const [server, setServer] = useState("");

  useEffect(() => {
    if (settings.data) setServer(settings.data.ntfyServer);
  }, [settings.data]);

  if (settings.isPending) return <Spinner label="Loading push settings" />;

  const dirty = server !== (settings.data?.ntfyServer ?? "");

  return (
    <div className="pb-10">
      <PageHeader
        title="Phone pushes"
        hint="ntfy sends a push to your phone the second a listing matches. Install the ntfy app, scan a code, done."
      />

      <PhoneAccess />

      <Section title="Server">
        <Labeled label="ntfy server" hint="ntfy.sh works out of the box. Point it at your own if you run one.">
          {(props) => (
            <input
              {...props}
              className="field text-[14px]"
              value={server}
              placeholder="https://ntfy.sh"
              onChange={(e) => setServer(e.currentTarget.value)}
            />
          )}
        </Labeled>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="ctl-primary semi px-4 text-[13.5px]"
            disabled={!dirty || update.isPending}
            onClick={() =>
              update.mutate(
                { ntfyServer: server },
                {
                  onSuccess: () => toast.push({ title: "Server saved" }),
                  onError: (error) =>
                    toast.push({ title: "Not saved", body: error.message, tone: "bad" }),
                },
              )
            }
          >
            {update.isPending ? "Saving" : "Save server"}
          </button>
          {settings.data?.ntfyCommandTopicConfigured ? (
            <Chip tone="moss">Send button ready</Chip>
          ) : (
            <Chip tone="quiet">Send button off</Chip>
          )}
        </div>
        {settings.data?.ntfyCommandTopicConfigured ? null : (
          <p className="text-[12.5px] text-ink-2">
            The send button on a push needs NTFY_COMMAND_TOPIC in your .env file. The server writes
            one on first run.
          </p>
        )}
      </Section>

      <h2 className="wide px-4 pt-2 text-[15px] lg:px-6">One topic per profile</h2>
      {(profiles.data ?? []).length === 0 ? (
        <Empty
          title="No profiles to push"
          next="Each profile gets its own topic so you can share one with roommates and keep the other private."
          action={
            <Link to="/settings/profiles/new" className="ctl med flex items-center px-4 text-[14px]">
              Create a profile
            </Link>
          }
        />
      ) : null}
      {(profiles.data ?? []).map((profile) => (
        <ProfileTopic key={profile.id} profile={profile} server={server} />
      ))}
    </div>
  );
}
