import { z } from "zod";
import { ListingSchema } from "./listing.ts";
import { MatchSchema } from "./preferences.ts";

/** Where a listing sits in the hunt. Global per listing, since one instance serves one household. */
export const STAGES = [
  "new",
  "interested",
  "contacted",
  "replied",
  "touring",
  "applied",
  "signed",
  "passed",
] as const;
export const StageSchema = z.enum(STAGES);
export type Stage = z.infer<typeof StageSchema>;

export const ListingStateSchema = z.object({
  stage: StageSchema,
  starred: z.boolean(),
  hidden: z.boolean(),
  notes: z.string(),
});
export type ListingState = z.infer<typeof ListingStateSchema>;
export const ListingStatePatchSchema = ListingStateSchema.partial();

/** What the dashboard renders: the listing, its state, and its match against every profile. */
export const ListingViewSchema = z.object({
  listing: ListingSchema,
  state: ListingStateSchema,
  matches: z.array(MatchSchema),
  draftIds: z.array(z.string()),
});
export type ListingView = z.infer<typeof ListingViewSchema>;

export const ListingQuerySchema = z.object({
  profileId: z.string().optional(),
  // matched = passes the profile's hard filters. all = everything scraped, with reject reasons.
  scope: z.enum(["matched", "all"]).default("matched"),
  stage: StageSchema.optional(),
  // stringbool, because z.coerce.boolean() turns the query string "false" into true
  starred: z.stringbool().optional(),
  includeHidden: z.stringbool().default(false),
  includeGone: z.stringbool().default(false),
  sourceId: z.string().optional(),
  q: z.string().optional(),
  sort: z.enum(["newest", "score", "priceAsc", "priceDesc", "distance"]).default("newest"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListingQuery = z.infer<typeof ListingQuerySchema>;

export const ListingPageSchema = z.object({
  items: z.array(ListingViewSchema),
  total: z.number(),
});
export type ListingPage = z.infer<typeof ListingPageSchema>;

// email = sent by the app over SMTP
// form  = landlord only takes a web form or relay; the app shows the text to paste and a link
// sms   = phone-only contact; the app shows the text and an sms: link
export const DraftChannelSchema = z.enum(["email", "form", "sms"]);
export type DraftChannel = z.infer<typeof DraftChannelSchema>;
export const DraftStatusSchema = z.enum(["staged", "sending", "sent", "failed", "discarded"]);
export type DraftStatus = z.infer<typeof DraftStatusSchema>;

export const DraftSchema = z.object({
  id: z.string(),
  listingId: z.string(),
  profileId: z.string(),
  channel: DraftChannelSchema,
  to: z.string().nullable(),
  subject: z.string(),
  body: z.string(),
  status: DraftStatusSchema,
  generatedBy: z.enum(["template", "llm"]),
  error: z.string().nullable(),
  createdAt: z.string(),
  sentAt: z.string().nullable(),
});
export type Draft = z.infer<typeof DraftSchema>;
export const DraftPatchSchema = DraftSchema.pick({ to: true, subject: true, body: true }).partial();

/**
 * Templates use {{variable}} placeholders. Available variables:
 * listing.title, listing.address, listing.price, listing.beds, listing.url, listing.availableDate,
 * contact.name, contact.company, me.fullName, me.email, me.phone, me.school, me.blurb,
 * group.size, profile.moveIn, profile.name
 */
export const TemplateSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  subject: z.string(),
  body: z.string(),
});
export type Template = z.infer<typeof TemplateSchema>;
export const TemplateWriteSchema = TemplateSchema.omit({ id: true });

export const NotificationKindSchema = z.enum([
  "match",
  "priceDrop",
  "backOnMarket",
  "digest",
  "draftSent",
  "draftFailed",
  "sourceDown",
  "sourceRecovered",
]);
export type NotificationKind = z.infer<typeof NotificationKindSchema>;
export const NotificationSchema = z.object({
  id: z.string(),
  kind: NotificationKindSchema,
  title: z.string(),
  body: z.string(),
  listingId: z.string().nullable(),
  profileId: z.string().nullable(),
  // false when the push was held (quiet hours), skipped (no topic), or failed
  pushed: z.boolean(),
  createdAt: z.string(),
  readAt: z.string().nullable(),
});
export type Notification = z.infer<typeof NotificationSchema>;

// http    = plain fetch
// browser = needs a headless browser, slower cadence
// account = runs through the user's own logged-in browser profile (Facebook). Off until the user logs in.
export const SourceKindSchema = z.enum(["http", "browser", "account"]);
export type SourceKind = z.infer<typeof SourceKindSchema>;

export const SourceStatusSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: SourceKindSchema,
  homepage: z.string(),
  enabled: z.boolean(),
  intervalSec: z.number(),
  // True when the source cannot run yet (no Facebook login, no landlord subdomains configured)
  needsSetup: z.boolean(),
  setupHint: z.string().nullable(),
  // Free-form per-source config, e.g. { subdomains: ["americanmanagement"] } for AppFolio
  config: z.record(z.string(), z.unknown()),
  lastRunAt: z.string().nullable(),
  lastSuccessAt: z.string().nullable(),
  lastError: z.string().nullable(),
  consecutiveFailures: z.number(),
  lastRunCount: z.number(),
  totalListings: z.number(),
});
export type SourceStatus = z.infer<typeof SourceStatusSchema>;
export const SourcePatchSchema = z.object({
  enabled: z.boolean().optional(),
  intervalSec: z.number().int().min(30).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const IdentitySchema = z.object({
  fullName: z.string().default(""),
  email: z.string().default(""),
  phone: z.string().default(""),
  // "Johns Hopkins University, Class of 2028" style line
  school: z.string().default(""),
  // Two or three sentences the drafts use to introduce the group
  blurb: z.string().default(""),
});
export type Identity = z.infer<typeof IdentitySchema>;

// How "Email landlord" opens a prefilled message in the user's own mailbox.
// mailto  = the device's default mail app (works from an ntfy push on a phone)
// outlook = Outlook on the web, which is what JHU school accounts use
// gmail   = Gmail on the web
export const ComposeViaSchema = z.enum(["mailto", "outlook", "gmail"]);
export type ComposeVia = z.infer<typeof ComposeViaSchema>;

export const SettingsSchema = z.object({
  setupComplete: z.boolean(),
  campusId: z.string(),
  identity: IdentitySchema,
  composeVia: ComposeViaSchema,
  ntfyServer: z.string(),
  // URL the pushes link back to. Tailscale hostname or localhost.
  dashboardUrl: z.string(),
  // Read-only flags derived from the environment. Secrets never leave the server.
  smtpConfigured: z.boolean(),
  llmConfigured: z.boolean(),
  ntfyCommandTopicConfigured: z.boolean(),
});
export type Settings = z.infer<typeof SettingsSchema>;
export const SettingsPatchSchema = SettingsSchema.pick({
  setupComplete: true,
  campusId: true,
  identity: true,
  composeVia: true,
  ntfyServer: true,
  dashboardUrl: true,
}).partial();

/** Server-sent events on GET /api/events. The dashboard refetches the affected query on each. */
export const ServerEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("listing.upserted"), listingId: z.string(), isNew: z.boolean() }),
  z.object({ type: z.literal("listing.state"), listingId: z.string() }),
  z.object({ type: z.literal("draft.changed"), draftId: z.string(), listingId: z.string() }),
  z.object({ type: z.literal("notification.created"), notification: NotificationSchema }),
  z.object({ type: z.literal("source.status"), sourceId: z.string() }),
  z.object({ type: z.literal("profiles.changed") }),
]);
export type ServerEvent = z.infer<typeof ServerEventSchema>;

export const StatsSchema = z.object({
  activeListings: z.number(),
  matchedListings: z.number(),
  newLast24h: z.number(),
  stagedDrafts: z.number(),
  unreadNotifications: z.number(),
  sourcesDown: z.number(),
  byStage: z.record(StageSchema, z.number()),
});
export type Stats = z.infer<typeof StatsSchema>;

/**
 * REST surface, all under /api. JSON in and out. Errors are { error: string } with a 4xx or 5xx status.
 *
 * GET    /health                     -> { ok: true, version }
 * GET    /stats                      -> Stats
 * GET    /campuses                   -> CampusPreset[]
 * GET    /settings                   -> Settings
 * PATCH  /settings                   SettingsPatch -> Settings
 *
 * GET    /profiles                   -> Profile[]
 * POST   /profiles                   ProfileWrite -> Profile
 * PUT    /profiles/:id               ProfileWrite -> Profile        (re-evaluates every active listing)
 * DELETE /profiles/:id               -> 204
 * POST   /profiles/preview           ProfileWrite -> { matched: number, total: number, topRejectReasons: [FilterReason, number][] }
 *
 * GET    /listings                   ListingQuery -> ListingPage
 * GET    /listings/:id               -> ListingView
 * PATCH  /listings/:id/state         ListingStatePatch -> ListingView
 *
 * GET    /drafts?status=             -> Draft[]
 * GET    /drafts/:id                 -> Draft
 * POST   /listings/:id/drafts        { profileId } -> Draft         (create or regenerate)
 * PATCH  /drafts/:id                 DraftPatch -> Draft
 * POST   /drafts/:id/send            -> Draft                        (email channel, only when SMTP is configured; moves listing to "contacted")
 * POST   /drafts/:id/mark-sent       -> Draft                        (any channel; the user sent it from their own mailbox, a form, or a text; moves listing to "contacted")
 * DELETE /drafts/:id                 -> 204                          (status becomes "discarded")
 *
 * GET    /templates                  -> Template[]
 * POST   /templates                  TemplateWrite -> Template
 * PUT    /templates/:id              TemplateWrite -> Template
 * DELETE /templates/:id              -> 204
 *
 * GET    /notifications?unread=      -> Notification[]
 * POST   /notifications/read         { ids?: string[] } -> 204       (no ids = mark all)
 *
 * GET    /sources                    -> SourceStatus[]
 * PATCH  /sources/:id                SourcePatch -> SourceStatus
 * POST   /sources/:id/run            -> SourceStatus                 (run now)
 *
 * POST   /test/ntfy                  { profileId } -> { ok: boolean, error?: string }
 * POST   /test/smtp                  -> { ok: boolean, error?: string }
 *
 * GET    /events                     text/event-stream of ServerEvent
 */
export const API_PREFIX = "/api";
