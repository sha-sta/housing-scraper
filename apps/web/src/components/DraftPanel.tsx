import { useEffect, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  composeUrl,
  type ComposeVia,
  type Contact,
  type Draft,
  type DraftChannel,
} from "@housing/shared";
import { api } from "../lib/api.ts";
import { keys, useDraftMutations } from "../lib/queries.ts";
import { useCopy } from "../lib/clipboard.ts";
import { composeLabel, formatDateTime, smsHref } from "../lib/format.ts";
import { useToast } from "../lib/toast.tsx";
import { Chip } from "./ui.tsx";
import { IconCheck, IconCopy, IconExternal, IconRefresh } from "./icons.tsx";

export function useListingDrafts(draftIds: string[]) {
  return useQueries({
    queries: draftIds.map((id) => ({ queryKey: keys.draft(id), queryFn: () => api.draft(id) })),
    combine: (results) => ({
      drafts: results.flatMap((result) => (result.data ? [result.data] : [])),
      pending: results.some((result) => result.isPending),
    }),
  });
}

const CHANNEL_NOTE: Record<DraftChannel, string> = {
  email: "Open it in your own mailbox so the landlord sees your school address, then mark it sent.",
  form: "This landlord only takes a web form. Copy the text, open the form, then mark it sent.",
  sms: "This landlord left only a phone number. Open your messages app, then mark it sent.",
};

export function DraftPanel({
  listingId,
  profileId,
  draftIds,
  contact,
  composeVia,
  smtpConfigured,
  compact,
}: {
  listingId: string;
  profileId: string | null;
  draftIds: string[];
  contact: Contact;
  composeVia: ComposeVia;
  smtpConfigured: boolean;
  compact?: boolean;
}) {
  const { drafts, pending } = useListingDrafts(draftIds);
  const mutations = useDraftMutations();
  const toast = useToast();

  const live = drafts.filter((draft) => draft.status !== "discarded");
  const draft =
    live.find((item) => item.profileId === profileId && item.status === "staged") ??
    live.find((item) => item.status === "staged") ??
    live[0] ??
    null;

  if (pending && draftIds.length > 0) {
    return <p className="text-[13px] text-ink-2">Loading the draft</p>;
  }

  if (!draft) {
    return (
      <div className="rounded-[8px] border border-dashed border-rule-strong px-4 py-5 text-center">
        <p className="semi text-[14px]">No outreach staged</p>
        <p className="mx-auto mt-1 max-w-[44ch] text-[13px] text-ink-2">
          Write one now and the app fills it from your template and this listing.
        </p>
        <button
          type="button"
          className="ctl-primary med mt-3 px-4 text-[14px]"
          disabled={profileId === null || mutations.regenerate.isPending}
          onClick={() => {
            if (profileId === null) return;
            mutations.regenerate.mutate({ listingId, profileId });
          }}
        >
          {mutations.regenerate.isPending ? "Writing" : "Write a draft"}
        </button>
      </div>
    );
  }

  return (
    <DraftEditor
      key={draft.id}
      draft={draft}
      contact={contact}
      composeVia={composeVia}
      smtpConfigured={smtpConfigured}
      compact={compact}
      onToast={toast.push}
      mutations={mutations}
    />
  );
}

type Mutations = ReturnType<typeof useDraftMutations>;

function CopyButton({
  label,
  copyKey,
  text,
  copied,
  onCopy,
  primary,
}: {
  label: string;
  copyKey: string;
  text: string;
  copied: string | null;
  onCopy: (key: string, text: string) => void;
  primary?: boolean;
}) {
  const done = copied === copyKey;
  return (
    <button
      type="button"
      onClick={() => onCopy(copyKey, text)}
      className={`${primary ? "ctl-primary semi px-4" : "ctl med"} flex items-center gap-1.5 text-[13.5px]`}
      data-testid={`copy-${copyKey}`}
    >
      {done ? <IconCheck className="h-4 w-4" /> : <IconCopy className="h-4 w-4" />}
      {done ? "Copied" : label}
    </button>
  );
}

export function DraftEditor({
  draft,
  contact,
  composeVia,
  smtpConfigured,
  compact,
  onToast,
  mutations,
}: {
  draft: Draft;
  contact: Contact;
  composeVia: ComposeVia;
  smtpConfigured: boolean;
  compact?: boolean;
  onToast: (input: { title: string; body?: string; tone?: "plain" | "bad" }) => void;
  mutations: Mutations;
}) {
  const [to, setTo] = useState(draft.to ?? "");
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [handedOff, setHandedOff] = useState(false);
  const { copied, copy } = useCopy();

  // Only refill the fields when the draft is actually replaced, which is a new draft or a
  // regenerate. Echoing every save back into the inputs would clobber whatever was typed
  // while the save was in flight.
  useEffect(() => {
    setTo(draft.to ?? "");
    setSubject(draft.subject);
    setBody(draft.body);
    setHandedOff(false);
  }, [draft.id, draft.createdAt]);

  const dirty = to !== (draft.to ?? "") || subject !== draft.subject || body !== draft.body;
  const sent = draft.status === "sent";
  const locked = sent || draft.status === "sending";
  const allText = draft.channel === "email" ? `To: ${to}\nSubject: ${subject}\n\n${body}` : `${subject}\n\n${body}`;

  async function save(): Promise<void> {
    if (!dirty) return;
    await mutations.save.mutateAsync({
      id: draft.id,
      patch: { to: to || null, subject, body },
    });
  }

  function runCopy(key: string, text: string): void {
    void copy(key, text).then((ok) => {
      if (ok) {
        setHandedOff(true);
        void save();
      } else {
        onToast({
          title: "Could not copy",
          body: "Select the text and copy it by hand",
          tone: "bad",
        });
      }
    });
  }

  async function sendNow(): Promise<void> {
    try {
      await save();
      await mutations.send.mutateAsync(draft.id);
      onToast({ title: "Sent", body: `Email on its way to ${to || "the landlord"}` });
    } catch (error) {
      onToast({
        title: "Not sent",
        body: error instanceof Error ? error.message : "The server refused the send",
        tone: "bad",
      });
    }
  }

  async function markSent(): Promise<void> {
    try {
      await save();
      await mutations.markSent.mutateAsync(draft.id);
      onToast({ title: "Marked as sent", body: "The listing moved to Contacted" });
    } catch (error) {
      onToast({
        title: "Could not mark it sent",
        body: error instanceof Error ? error.message : "The server refused it",
        tone: "bad",
      });
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="draft-panel">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={sent ? "moss" : "quiet"}>
          {draft.channel === "email"
            ? "Email"
            : draft.channel === "sms"
              ? "Text message"
              : "Web form"}
        </Chip>
        <Chip tone="quiet">
          {draft.generatedBy === "llm" ? "Written by Claude" : "From template"}
        </Chip>
        {draft.status === "failed" && draft.error ? (
          <span className="text-[12.5px] text-brick">{draft.error}</span>
        ) : null}
      </div>

      {sent ? (
        <div
          className="rounded-[8px] border px-3 py-2.5"
          style={{ borderColor: "var(--moss)", background: "var(--moss-soft)" }}
          data-testid="draft-sent"
        >
          <p className="semi text-[13.5px]">Sent {formatDateTime(draft.sentAt)}</p>
          <p className="mt-0.5 text-[12.5px] text-ink-2">
            This listing moved to Contacted. The app will not write the same address twice.
          </p>
        </div>
      ) : (
        <p className="text-[12.5px] text-ink-2">{CHANNEL_NOTE[draft.channel]}</p>
      )}

      {draft.channel === "email" ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={`to-${draft.id}`} className="med text-[13px]">
              To
            </label>
            <button
              type="button"
              onClick={() => runCopy("to", to)}
              className="med min-h-[44px] min-w-[44px] px-1.5 text-[12.5px] text-ink-2 hover:text-ink"
              data-testid="copy-to"
            >
              {copied === "to" ? "Copied" : "Copy"}
            </button>
          </div>
          <input
            id={`to-${draft.id}`}
            className="field text-[14px]"
            type="email"
            value={to}
            disabled={locked}
            onChange={(e) => setTo(e.currentTarget.value)}
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={`subject-${draft.id}`} className="med text-[13px]">
            Subject
          </label>
          <button
            type="button"
            onClick={() => runCopy("subject", subject)}
            className="med min-h-[44px] min-w-[44px] px-1.5 text-[12.5px] text-ink-2 hover:text-ink"
            data-testid="copy-subject"
          >
            {copied === "subject" ? "Copied" : "Copy"}
          </button>
        </div>
        <input
          id={`subject-${draft.id}`}
          className="field text-[14px]"
          value={subject}
          disabled={locked}
          onChange={(e) => setSubject(e.currentTarget.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={`body-${draft.id}`} className="med text-[13px]">
            Message
          </label>
          <button
            type="button"
            onClick={() => runCopy("body", body)}
            className="med min-h-[44px] min-w-[44px] px-1.5 text-[12.5px] text-ink-2 hover:text-ink"
            data-testid="copy-body"
          >
            {copied === "body" ? "Copied" : "Copy"}
          </button>
        </div>
        <textarea
          id={`body-${draft.id}`}
          className="field text-[14px]"
          rows={compact ? 7 : 12}
          value={body}
          disabled={locked}
          onChange={(e) => setBody(e.currentTarget.value)}
        />
      </div>

      {sent ? null : (
        <div className="flex flex-wrap items-center gap-2">
          {draft.channel === "email" ? (
            <>
              <a
                className="ctl-primary semi flex items-center gap-1.5 px-4 text-[13.5px]"
                href={composeUrl(composeVia, { to, subject, body })}
                target={composeVia === "mailto" ? undefined : "_blank"}
                rel={composeVia === "mailto" ? undefined : "noreferrer noopener"}
                onClick={() => {
                  setHandedOff(true);
                  void save();
                }}
                data-testid="open-in-mail"
              >
                <IconExternal className="h-4 w-4" />
                {composeLabel(composeVia)}
              </a>
              <CopyButton
                label="Copy all"
                copyKey="all"
                text={allText}
                copied={copied}
                onCopy={runCopy}
              />
            </>
          ) : null}

          {draft.channel === "form" ? (
            <>
              <CopyButton
                label="Copy all"
                copyKey="all"
                text={allText}
                copied={copied}
                onCopy={runCopy}
                primary
              />
              {contact.formUrl ? (
                <a
                  className="ctl med flex items-center gap-1.5 text-[13.5px]"
                  href={contact.formUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  onClick={() => setHandedOff(true)}
                >
                  <IconExternal className="h-4 w-4" />
                  Open form
                </a>
              ) : null}
            </>
          ) : null}

          {draft.channel === "sms" ? (
            <>
              {contact.phone ? (
                <a
                  className="ctl-primary semi flex items-center px-4 text-[13.5px]"
                  href={smsHref(contact.phone, body)}
                  onClick={() => setHandedOff(true)}
                >
                  Open in Messages
                </a>
              ) : null}
              <CopyButton
                label="Copy all"
                copyKey="all"
                text={allText}
                copied={copied}
                onCopy={runCopy}
              />
            </>
          ) : null}

          {handedOff || draft.channel !== "email" ? (
            <button
              type="button"
              className="ctl-primary semi px-4 text-[13.5px]"
              disabled={mutations.markSent.isPending}
              onClick={() => void markSent()}
              data-testid="mark-sent"
            >
              {mutations.markSent.isPending ? "Marking" : "Mark as sent"}
            </button>
          ) : null}

          {smtpConfigured && draft.channel === "email" ? (
            <button
              type="button"
              className="ctl med text-[13.5px]"
              disabled={mutations.send.isPending || to.trim() === ""}
              onClick={() => void sendNow()}
              data-testid="send-draft"
            >
              {mutations.send.isPending ? "Sending" : "Send now"}
            </button>
          ) : null}

          <button
            type="button"
            className="ctl med text-[13.5px]"
            disabled={!dirty || mutations.save.isPending}
            onClick={() => void save()}
          >
            {mutations.save.isPending ? "Saving" : "Save"}
          </button>

          <button
            type="button"
            className="ctl med flex items-center gap-1.5 text-[13.5px]"
            disabled={mutations.regenerate.isPending}
            onClick={() =>
              mutations.regenerate.mutate({
                listingId: draft.listingId,
                profileId: draft.profileId,
              })
            }
          >
            <IconRefresh className="h-4 w-4" />
            {mutations.regenerate.isPending ? "Rewriting" : "Regenerate"}
          </button>

          <button
            type="button"
            className="med ml-auto min-h-[44px] px-2 text-[13.5px] text-ink-2 hover:text-brick"
            onClick={() => mutations.discard.mutate({ id: draft.id, listingId: draft.listingId })}
          >
            Discard
          </button>
        </div>
      )}
    </div>
  );
}
