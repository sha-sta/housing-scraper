import { index, integer, primaryKey, real, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

// Every column named *Json holds JSON text. Reads parse it with the matching Zod schema from
// @housing/shared, so a hand-edited database cannot put a bad shape into the API.

export const listings = sqliteTable(
  "listings",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    price: real("price"),
    priceMax: real("price_max"),
    beds: real("beds"),
    bedsMax: real("beds_max"),
    baths: real("baths"),
    sqft: real("sqft"),
    propertyType: text("property_type").notNull(),
    isSublet: integer("is_sublet", { mode: "boolean" }).notNull(),
    incomeRestricted: integer("income_restricted", { mode: "boolean" }).notNull(),
    seniorHousing: integer("senior_housing", { mode: "boolean" }).notNull(),
    address: text("address"),
    neighborhood: text("neighborhood"),
    zip: text("zip"),
    lat: real("lat"),
    lon: real("lon"),
    availableDate: text("available_date"),
    leaseMonths: real("lease_months"),
    photosJson: text("photos_json").notNull(),
    amenitiesJson: text("amenities_json").notNull(),
    contactJson: text("contact_json").notNull(),
    scamSignalsJson: text("scam_signals_json").notNull(),
    priceHistoryJson: text("price_history_json").notNull(),
    status: text("status").notNull(),
    postedAt: text("posted_at"),
    firstSeenAt: text("first_seen_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
  },
  (t) => [index("listings_status_idx").on(t.status), index("listings_first_seen_idx").on(t.firstSeenAt)],
);

export const listingSources = sqliteTable(
  "listing_sources",
  {
    id: text("id").primaryKey(),
    listingId: text("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    sourceId: text("source_id").notNull(),
    sourceListingId: text("source_listing_id").notNull(),
    url: text("url").notNull(),
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull(),
    missedRuns: integer("missed_runs").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
  },
  (t) => [
    unique("listing_sources_key").on(t.sourceId, t.sourceListingId),
    index("listing_sources_listing_idx").on(t.listingId),
  ],
);

export const listingState = sqliteTable("listing_state", {
  listingId: text("listing_id")
    .primaryKey()
    .references(() => listings.id, { onDelete: "cascade" }),
  stage: text("stage").notNull(),
  starred: integer("starred", { mode: "boolean" }).notNull(),
  hidden: integer("hidden", { mode: "boolean" }).notNull(),
  notes: text("notes").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const matches = sqliteTable(
  "matches",
  {
    listingId: text("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    matched: integer("matched", { mode: "boolean" }).notNull(),
    rejectedByJson: text("rejected_by_json").notNull(),
    score: real("score").notNull(),
    breakdownJson: text("breakdown_json").notNull(),
    pricePerPerson: real("price_per_person"),
    walkMinutes: real("walk_minutes"),
    distanceMiles: real("distance_miles"),
    notifiedAt: text("notified_at"),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.listingId, t.profileId] }),
    index("matches_profile_idx").on(t.profileId, t.matched),
  ],
);

export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  color: text("color").notNull(),
  preferencesJson: text("preferences_json").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const drafts = sqliteTable(
  "drafts",
  {
    id: text("id").primaryKey(),
    listingId: text("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    profileId: text("profile_id").notNull(),
    channel: text("channel").notNull(),
    to: text("to"),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    status: text("status").notNull(),
    generatedBy: text("generated_by").notNull(),
    error: text("error"),
    createdAt: text("created_at").notNull(),
    sentAt: text("sent_at"),
  },
  (t) => [index("drafts_listing_idx").on(t.listingId), index("drafts_status_idx").on(t.status)],
);

export const templates = sqliteTable("templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
});

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    listingId: text("listing_id"),
    profileId: text("profile_id"),
    pushed: integer("pushed", { mode: "boolean" }).notNull(),
    createdAt: text("created_at").notNull(),
    readAt: text("read_at"),
  },
  (t) => [index("notifications_created_idx").on(t.createdAt)],
);

export const sources = sqliteTable("sources", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  homepage: text("homepage").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  intervalSec: integer("interval_sec").notNull(),
  configJson: text("config_json").notNull(),
  needsSetup: integer("needs_setup", { mode: "boolean" }).notNull(),
  setupHint: text("setup_hint"),
  lastRunAt: text("last_run_at"),
  lastSuccessAt: text("last_success_at"),
  lastError: text("last_error"),
  consecutiveFailures: integer("consecutive_failures").notNull(),
  lastRunCount: integer("last_run_count").notNull(),
  totalListings: integer("total_listings").notNull(),
  // Set once the first successful run has stored its inventory. Until then every match is a baseline.
  baselineAt: text("baseline_at"),
  // When the source was last switched off, so a long pause can rebaseline instead of pushing a backlog.
  disabledAt: text("disabled_at"),
  backoffUntil: text("backoff_until"),
  downNotifiedAt: text("down_notified_at"),
});

export const geocodeCache = sqliteTable("geocode_cache", {
  addressKey: text("address_key").primaryKey(),
  lat: real("lat"),
  lon: real("lon"),
  matchedAddress: text("matched_address"),
  createdAt: text("created_at").notNull(),
});

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  setupComplete: integer("setup_complete", { mode: "boolean" }).notNull(),
  campusId: text("campus_id").notNull(),
  identityJson: text("identity_json").notNull(),
  composeVia: text("compose_via").notNull(),
  ntfyServer: text("ntfy_server").notNull(),
  dashboardUrl: text("dashboard_url").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const outboxHolds = sqliteTable(
  "outbox_holds",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id").notNull(),
    notificationId: text("notification_id").notNull(),
    // "quiet" waits for the quiet window to end, "budget" waits for the next 30 minute digest.
    reason: text("reason").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    click: text("click"),
    createdAt: text("created_at").notNull(),
    releasedAt: text("released_at"),
  },
  (t) => [index("outbox_holds_profile_idx").on(t.profileId, t.releasedAt)],
);

/** One row per UTC day, so the ntfy.sh daily cap survives a restart. */
export const pushBudget = sqliteTable("push_budget", {
  day: text("day").primaryKey(),
  count: integer("count").notNull(),
});

/** Pedestrian route minutes from an optional Valhalla instance, keyed by listing and anchor. */
export const routeCache = sqliteTable("route_cache", {
  key: text("key").primaryKey(),
  walkMinutes: real("walk_minutes"),
  createdAt: text("created_at").notNull(),
});
