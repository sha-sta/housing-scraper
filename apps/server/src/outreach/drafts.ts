import type { Contact, Draft, DraftChannel, Listing, Profile, Template } from "@housing/shared";
import type { EventBus } from "../api/events.ts";
import type { Repos } from "../db/repo/index.ts";
import { newId } from "../ids.ts";
import type { Logger } from "../log.ts";
import type { Notifier } from "../notify/notifier.ts";
import type { Personalizer } from "./llm.ts";
import type { Mailer } from "./mailer.ts";
import { render, templateVariables } from "./render.ts";


/** Email first, because it is the only channel the app can complete without the user leaving it. */
export function chooseChannel(contact: Contact): DraftChannel | null {
  if (contact.email !== null && contact.email !== "") return "email";
  if (contact.phone !== null && contact.phone !== "") return "sms";
  if (contact.formUrl !== null && contact.formUrl !== "") return "form";
  return null;
}

function recipientFor(channel: DraftChannel, contact: Contact): string | null {
  if (channel === "email") return contact.email;
  if (channel === "sms") return contact.phone;
  return contact.formUrl;
}

export interface DraftService {
  stage(listing: Listing, profile: Profile): Promise<Draft | null>;
  send(draftId: string): Promise<Draft>;
  markSent(draftId: string): Promise<Draft>;
  discard(draftId: string): Draft | null;
  patch(draftId: string, patch: Partial<Pick<Draft, "to" | "subject" | "body">>): Draft | null;
}

export interface DraftServiceOptions {
  repos: Repos;
  bus: EventBus;
  mailer: Mailer;
  personalizer: Personalizer;
  notifier: Notifier;
  log: Logger;
}

function pickTemplate(templates: Template[], preferredId: string | null): Template | null {
  if (preferredId !== null) {
    const exact = templates.find((t) => t.id === preferredId);
    if (exact !== undefined) return exact;
  }
  return templates[0] ?? null;
}

export function createDraftService(options: DraftServiceOptions): DraftService {
  const { repos, bus, mailer, personalizer, notifier, log } = options;

  function announce(draft: Draft): Draft {
    bus.publish({ type: "draft.changed", draftId: draft.id, listingId: draft.listingId });
    return draft;
  }

  function contacted(listingId: string, at: string): void {
    const state = repos.listings.getState(listingId);
    if (state.stage === "new" || state.stage === "interested") {
      repos.listings.setState(listingId, { ...state, stage: "contacted" }, at);
      bus.publish({ type: "listing.state", listingId });
    }
  }

  return {
    async stage(listing, profile) {
      const channel = chooseChannel(listing.contact);
      if (channel === null) return null;

      const template = pickTemplate(repos.outreach.listTemplates(), profile.preferences.outreach.templateId);
      if (template === null) return null;

      const settings = repos.config.getSettings();
      if (settings === null) return null;

      const variables = templateVariables(listing, profile, settings.identity);
      const subject = render(template.subject, variables);
      const rendered = render(template.body, variables);

      const personalized = await personalizer.personalize(rendered, listing);
      const body = personalized ?? rendered;

      const now = new Date().toISOString();
      const existing = repos.outreach.findStaged(listing.id, profile.id);
      const draft: Draft = {
        id: existing?.id ?? newId("drf"),
        listingId: listing.id,
        profileId: profile.id,
        channel,
        to: recipientFor(channel, listing.contact),
        subject,
        body,
        status: "staged",
        generatedBy: personalized === null ? "template" : "llm",
        error: null,
        createdAt: existing?.createdAt ?? now,
        sentAt: null,
      };

      if (existing === null) repos.outreach.insertDraft(draft);
      else repos.outreach.updateDraft(draft);
      return announce(draft);
    },

    async send(draftId) {
      const draft = repos.outreach.getDraft(draftId);
      if (draft === null) throw new Error("draft not found");
      if (draft.channel !== "email") throw new Error("only email drafts can be sent by the app");
      if (draft.status !== "staged") throw new Error(`draft is ${draft.status}, not staged`);
      if (draft.to === null || draft.to === "") throw new Error("draft has no recipient");
      if (!mailer.configured) throw new Error("SMTP is not configured");
      if (repos.outreach.hasSentTo(draft.listingId, draft.to)) {
        throw new Error("this listing already had an email sent to that address");
      }

      const sending: Draft = { ...draft, status: "sending" };
      repos.outreach.updateDraft(sending);
      announce(sending);

      try {
        await mailer.send({ to: draft.to, subject: draft.subject, text: draft.body });
      } catch (error) {
        const failed: Draft = { ...draft, status: "failed", error: String(error) };
        repos.outreach.updateDraft(failed);
        const profile = repos.profiles.get(draft.profileId);
        await notifier.deliver({
          kind: "draftFailed",
          profile,
          listingId: draft.listingId,
          title: "Email failed to send",
          body: `${draft.subject}\n${String(error)}`,
          priority: 4,
          tags: ["warning"],
          alwaysSend: true,
        });
        return announce(failed);
      }

      const at = new Date().toISOString();
      const sent: Draft = { ...draft, status: "sent", sentAt: at, error: null };
      repos.outreach.updateDraft(sent);
      contacted(draft.listingId, at);
      log.info("draft sent", { draftId: draft.id, listingId: draft.listingId });

      const profile = repos.profiles.get(draft.profileId);
      await notifier.deliver({
        kind: "draftSent",
        profile,
        listingId: draft.listingId,
        title: "Email sent",
        body: draft.subject,
        priority: 3,
        tags: ["envelope"],
        alwaysSend: true,
      });
      return announce(sent);
    },

    /** Any channel. The user sent it from their own mailbox, a web form, or a text. */
    async markSent(draftId) {
      const draft = repos.outreach.getDraft(draftId);
      if (draft === null) throw new Error("draft not found");
      if (draft.status === "sent") return draft;
      if (draft.status !== "staged" && draft.status !== "failed") {
        throw new Error(`draft is ${draft.status}, not staged`);
      }
      const at = new Date().toISOString();
      const sent: Draft = { ...draft, status: "sent", sentAt: at, error: null };
      repos.outreach.updateDraft(sent);
      contacted(draft.listingId, at);
      return announce(sent);
    },

    discard(draftId) {
      const draft = repos.outreach.getDraft(draftId);
      if (draft === null) return null;
      const discarded: Draft = { ...draft, status: "discarded" };
      repos.outreach.updateDraft(discarded);
      return announce(discarded);
    },

    patch(draftId, patch) {
      const draft = repos.outreach.getDraft(draftId);
      if (draft === null) return null;
      const updated: Draft = {
        ...draft,
        to: patch.to === undefined ? draft.to : patch.to,
        subject: patch.subject ?? draft.subject,
        body: patch.body ?? draft.body,
      };
      repos.outreach.updateDraft(updated);
      return announce(updated);
    },
  };
}
