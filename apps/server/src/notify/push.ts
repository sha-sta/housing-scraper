import { composeUrl, type Draft, type Listing, type Match, type Profile } from "@housing/shared";
import { isLocalUrl } from "../network.ts";
import { signDraftId } from "./hmac.ts";
import type { NtfyAction } from "./ntfy.ts";

/** A phone mail app stops opening the link somewhere above this, so the full text stays in the dashboard. */
const MAX_MAILTO_CHARS = 1800;
const MAX_TITLE_CHARS = 120;
const MAX_ADDRESS_CHARS = 48;

export interface PushContext {
  dashboardUrl: string;
  ntfyServer: string;
  commandTopic: string;
  appSecret: string;
  smtpConfigured: boolean;
}

function money(value: number | null): string | null {
  return value === null ? null : `$${Math.round(value).toLocaleString("en-US")}`;
}

function shorten(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 3).trimEnd()}...`;
}

export function listingUrl(dashboardUrl: string, listingId: string): string {
  return `${dashboardUrl.replace(/\/+$/, "")}/listings/${listingId}`;
}

/**
 * Where a push about one listing should tap through to. A localhost dashboard is the phone itself,
 * so the source page is the only link that goes anywhere.
 */
export function listingClick(context: PushContext, listing: Listing): string | undefined {
  if (!isLocalUrl(context.dashboardUrl)) return listingUrl(context.dashboardUrl, listing.id);
  return listing.sources[0]?.url;
}

/** Summary, digest, and health pushes have no listing to fall back to. */
export function dashboardClick(dashboardUrl: string, path: string): string | undefined {
  if (isLocalUrl(dashboardUrl)) return undefined;
  return `${dashboardUrl.replace(/\/+$/, "")}${path}`;
}

export function profileFeedUrl(dashboardUrl: string, profileId: string): string {
  return `${dashboardUrl.replace(/\/+$/, "")}/?profile=${profileId}`;
}

export function matchTitle(listing: Listing): string {
  const parts = [
    money(listing.price),
    listing.beds === null ? null : `${listing.beds} bd`,
    listing.address === null ? null : shorten(listing.address, MAX_ADDRESS_CHARS),
  ].filter((part): part is string => part !== null);
  const title = parts.length === 0 ? listing.title : parts.join(", ");
  return shorten(title, MAX_TITLE_CHARS);
}

/** A per-room price needs all three numbers, or the reader has to do the arithmetic themselves. */
export function priceLine(listing: Listing, match: Match): string | null {
  if (listing.priceBasis === "room" && listing.price !== null && match.monthlyTotal !== null) {
    const each = match.pricePerPerson === null ? null : `${money(match.pricePerPerson)} each`;
    return [`${money(listing.price)} per room`, `about ${money(match.monthlyTotal)} total`, each]
      .filter((part): part is string => part !== null)
      .join(", ");
  }
  return match.pricePerPerson === null ? null : `${money(match.pricePerPerson)} per person`;
}

export function matchBody(listing: Listing, match: Match): string {
  const first = [`Score ${Math.round(match.score)}`, priceLine(listing, match)]
    .filter((part): part is string => part !== null)
    .join(", ");

  const second = [
    match.walkMinutes === null ? null : `${Math.round(match.walkMinutes)} min walk`,
    listing.availableDate === null ? null : `available ${listing.availableDate}`,
  ]
    .filter((part): part is string => part !== null)
    .join(", ");

  const source = listing.sources[0]?.sourceId ?? "unknown source";
  return [first, second, `via ${source}`].filter((line) => line !== "").join("\n");
}

/** Trims the body at a sentence boundary until the whole mailto link fits. */
export function fitMailtoUrl(to: string, subject: string, body: string): string {
  const full = composeUrl("mailto", { to, subject, body });
  if (full.length <= MAX_MAILTO_CHARS) return full;

  const sentences = body.split(/(?<=[.!?])\s+/);
  for (let keep = sentences.length - 1; keep >= 1; keep -= 1) {
    const candidate = composeUrl("mailto", { to, subject, body: sentences.slice(0, keep).join(" ") });
    if (candidate.length <= MAX_MAILTO_CHARS) return candidate;
  }

  let text = body;
  while (text.length > 0 && composeUrl("mailto", { to, subject, body: text }).length > MAX_MAILTO_CHARS) {
    text = text.slice(0, Math.floor(text.length * 0.8));
  }
  return composeUrl("mailto", { to, subject, body: text });
}

function commandUrl(context: PushContext): string {
  return `${context.ntfyServer.replace(/\/+$/, "")}/${context.commandTopic}`;
}

function markContactedAction(draft: Draft, context: PushContext): NtfyAction {
  return {
    action: "http",
    label: "Mark contacted",
    url: commandUrl(context),
    method: "POST",
    body: `sent:${draft.id}:${signDraftId(draft.id, context.appSecret)}`,
  };
}

/** The action that acts on the draft, plus the follow-up that records it when the app cannot. */
function outreachActions(draft: Draft, context: PushContext): NtfyAction[] {
  if (draft.channel === "email" && draft.to !== null && draft.to !== "") {
    if (context.smtpConfigured) {
      return [
        {
          action: "http",
          label: "Send email",
          url: commandUrl(context),
          method: "POST",
          body: `send:${draft.id}:${signDraftId(draft.id, context.appSecret)}`,
        },
      ];
    }
    // Only mailto opens a mail app from a phone push, whatever the dashboard is set to use.
    return [
      { action: "view", label: "Email landlord", url: fitMailtoUrl(draft.to, draft.subject, draft.body) },
      markContactedAction(draft, context),
    ];
  }

  if (draft.channel === "sms" && draft.to !== null && draft.to !== "") {
    const number = draft.to.replace(/[^\d+]/g, "");
    return [
      { action: "view", label: "Text landlord", url: `sms:${number}` },
      markContactedAction(draft, context),
    ];
  }

  if (draft.channel === "form" && draft.to !== null && draft.to !== "") {
    return [
      { action: "view", label: "Open reply form", url: draft.to },
      markContactedAction(draft, context),
    ];
  }

  return [];
}

export interface MatchPush {
  title: string;
  body: string;
  click: string | undefined;
  attach: string | undefined;
  priority: number;
  tags: string[];
  /** Owner topic only. */
  actions: NtfyAction[];
  /** Roommate topic. Just the link. */
  shareActions: NtfyAction[];
}

export function buildMatchPush(
  listing: Listing,
  match: Match,
  profile: Profile,
  draft: Draft | null,
  context: PushContext,
): MatchPush {
  const open: NtfyAction = {
    action: "view",
    label: "Open listing",
    url: listing.sources[0]?.url ?? listingUrl(context.dashboardUrl, listing.id),
  };
  const actions = draft === null ? [open] : [open, ...outreachActions(draft, context)];

  return {
    title: matchTitle(listing),
    body: matchBody(listing, match),
    click: listingClick(context, listing),
    attach: listing.photos[0],
    priority: match.score >= profile.preferences.notify.urgentScore ? 5 : 4,
    tags: ["house"],
    actions,
    shareActions: [open],
  };
}
