import { and, asc, desc, eq, inArray, like, notInArray, or, sql } from "drizzle-orm";
import {
  AmenityMapSchema,
  ContactSchema,
  ListingStateSchema,
  ListingStatusSchema,
  PricePointSchema,
  PropertyTypeSchema,
  ScamSignalSchema,
  STAGES,
  StageSchema,
  type Listing,
  type ListingQuery,
  type ListingState,
  type SourceLink,
  type Stage,
} from "@housing/shared";
import { z } from "zod";
import type { Db } from "../client.ts";
import { parseColumn, toColumn } from "../json.ts";
import { listingSources, listingState, listings, matches } from "../schema.ts";


const PhotosSchema = z.array(z.string());
const ScamSignalsSchema = z.array(ScamSignalSchema);
const PriceHistorySchema = z.array(PricePointSchema);

type ListingRow = typeof listings.$inferSelect;
type SourceRow = typeof listingSources.$inferSelect;

export interface ListingSourceRecord {
  id: string;
  listingId: string;
  sourceId: string;
  sourceListingId: string;
  url: string;
  isPrimary: boolean;
  missedRuns: number;
  lastSeenAt: string;
}

export const DEFAULT_STATE: ListingState = { stage: "new", starred: false, hidden: false, notes: "" };

function toSourceLink(row: SourceRow): SourceLink {
  return { sourceId: row.sourceId, sourceListingId: row.sourceListingId, url: row.url };
}

function toListing(row: ListingRow, sourceRows: SourceRow[]): Listing {
  const ordered = [...sourceRows].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    price: row.price,
    priceMax: row.priceMax,
    beds: row.beds,
    bedsMax: row.bedsMax,
    baths: row.baths,
    sqft: row.sqft,
    propertyType: PropertyTypeSchema.parse(row.propertyType),
    isSublet: row.isSublet,
    incomeRestricted: row.incomeRestricted,
    seniorHousing: row.seniorHousing,
    address: row.address,
    neighborhood: row.neighborhood,
    zip: row.zip,
    lat: row.lat,
    lon: row.lon,
    availableDate: row.availableDate,
    leaseMonths: row.leaseMonths,
    photos: parseColumn(PhotosSchema, row.photosJson, "listings.photos_json"),
    amenities: parseColumn(AmenityMapSchema, row.amenitiesJson, "listings.amenities_json"),
    contact: parseColumn(ContactSchema, row.contactJson, "listings.contact_json"),
    scamSignals: parseColumn(ScamSignalsSchema, row.scamSignalsJson, "listings.scam_signals_json"),
    sources: ordered.map(toSourceLink),
    priceHistory: parseColumn(PriceHistorySchema, row.priceHistoryJson, "listings.price_history_json"),
    status: ListingStatusSchema.parse(row.status),
    postedAt: row.postedAt,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
  };
}

function toRow(listing: Listing): ListingRow {
  return {
    id: listing.id,
    title: listing.title,
    description: listing.description,
    price: listing.price,
    priceMax: listing.priceMax,
    beds: listing.beds,
    bedsMax: listing.bedsMax,
    baths: listing.baths,
    sqft: listing.sqft,
    propertyType: listing.propertyType,
    isSublet: listing.isSublet,
    incomeRestricted: listing.incomeRestricted,
    seniorHousing: listing.seniorHousing,
    address: listing.address,
    neighborhood: listing.neighborhood,
    zip: listing.zip,
    lat: listing.lat,
    lon: listing.lon,
    availableDate: listing.availableDate,
    leaseMonths: listing.leaseMonths,
    photosJson: toColumn(listing.photos),
    amenitiesJson: toColumn(listing.amenities),
    contactJson: toColumn(listing.contact),
    scamSignalsJson: toColumn(listing.scamSignals),
    priceHistoryJson: toColumn(listing.priceHistory),
    status: listing.status,
    postedAt: listing.postedAt,
    firstSeenAt: listing.firstSeenAt,
    lastSeenAt: listing.lastSeenAt,
  };
}

export function createListingRepo(db: Db) {
  function sourceRowsFor(listingIds: string[]): Map<string, SourceRow[]> {
    const grouped = new Map<string, SourceRow[]>();
    if (listingIds.length === 0) return grouped;
    const rows = db.select().from(listingSources).where(inArray(listingSources.listingId, listingIds)).all();
    for (const row of rows) {
      const bucket = grouped.get(row.listingId);
      if (bucket === undefined) grouped.set(row.listingId, [row]);
      else bucket.push(row);
    }
    return grouped;
  }

  function hydrate(rows: ListingRow[]): Listing[] {
    const grouped = sourceRowsFor(rows.map((r) => r.id));
    return rows.map((row) => toListing(row, grouped.get(row.id) ?? []));
  }

  return {
    get(id: string): Listing | null {
      const row = db.select().from(listings).where(eq(listings.id, id)).get();
      if (row === undefined) return null;
      return hydrate([row])[0] ?? null;
    },

    getMany(ids: string[]): Listing[] {
      if (ids.length === 0) return [];
      return hydrate(db.select().from(listings).where(inArray(listings.id, ids)).all());
    },

    active(): Listing[] {
      return hydrate(db.select().from(listings).where(eq(listings.status, "active")).all());
    },

    all(): Listing[] {
      return hydrate(db.select().from(listings).all());
    },

    insert(listing: Listing): void {
      db.insert(listings).values(toRow(listing)).run();
    },

    update(listing: Listing): void {
      db.update(listings).set(toRow(listing)).where(eq(listings.id, listing.id)).run();
    },

    setStatus(ids: string[], status: Listing["status"]): void {
      if (ids.length === 0) return;
      db.update(listings).set({ status }).where(inArray(listings.id, ids)).run();
    },

    /** The source rows are the identity index: one row per place a unit was seen. */
    findBySourceKey(sourceId: string, sourceListingId: string): ListingSourceRecord | null {
      const row = db
        .select()
        .from(listingSources)
        .where(and(eq(listingSources.sourceId, sourceId), eq(listingSources.sourceListingId, sourceListingId)))
        .get();
      return row ?? null;
    },

    sourceRowsOf(listingId: string): ListingSourceRecord[] {
      return db.select().from(listingSources).where(eq(listingSources.listingId, listingId)).all();
    },

    knownSourceListingIds(sourceId: string): Set<string> {
      const rows = db
        .select({ key: listingSources.sourceListingId })
        .from(listingSources)
        .where(eq(listingSources.sourceId, sourceId))
        .all();
      return new Set(rows.map((r) => r.key));
    },

    addSourceRow(row: ListingSourceRecord): void {
      db.insert(listingSources).values(row).run();
    },

    touchSourceRow(id: string, at: string): void {
      db.update(listingSources).set({ missedRuns: 0, lastSeenAt: at }).where(eq(listingSources.id, id)).run();
    },

    /** Every stored row of this source that the run did not return gets one more missed run. */
    markMissed(sourceId: string, seenSourceListingIds: string[]): void {
      const where =
        seenSourceListingIds.length === 0
          ? eq(listingSources.sourceId, sourceId)
          : and(
              eq(listingSources.sourceId, sourceId),
              notInArray(listingSources.sourceListingId, seenSourceListingIds),
            );
      db
        .update(listingSources)
        .set({ missedRuns: sql`${listingSources.missedRuns} + 1` })
        .where(where)
        .run();
    },

    /** Listings whose every source row has reached the threshold. */
    listingsMissedEverywhere(threshold: number): string[] {
      const rows = db
        .select({ listingId: listingSources.listingId })
        .from(listingSources)
        .groupBy(listingSources.listingId)
        .having(sql`min(${listingSources.missedRuns}) >= ${threshold}`)
        .all();
      return rows.map((r) => r.listingId);
    },

    getState(listingId: string): ListingState {
      const row = db.select().from(listingState).where(eq(listingState.listingId, listingId)).get();
      if (row === undefined) return { ...DEFAULT_STATE };
      return ListingStateSchema.parse({
        stage: row.stage,
        starred: row.starred,
        hidden: row.hidden,
        notes: row.notes,
      });
    },

    getStates(listingIds: string[]): Map<string, ListingState> {
      const out = new Map<string, ListingState>();
      if (listingIds.length === 0) return out;
      const rows = db.select().from(listingState).where(inArray(listingState.listingId, listingIds)).all();
      for (const row of rows) {
        out.set(
          row.listingId,
          ListingStateSchema.parse({
            stage: row.stage,
            starred: row.starred,
            hidden: row.hidden,
            notes: row.notes,
          }),
        );
      }
      return out;
    },

    setState(listingId: string, state: ListingState, at: string): void {
      db
        .insert(listingState)
        .values({ listingId, ...state, updatedAt: at })
        .onConflictDoUpdate({ target: listingState.listingId, set: { ...state, updatedAt: at } })
        .run();
    },

    /** Drives GET /api/listings. Score and distance sorts fold the match rows down to one per listing. */
    query(q: ListingQuery): { rows: Listing[]; total: number } {
      const agg = db
        .select({
          listingId: matches.listingId,
          bestScore: sql<number>`max(${matches.score})`.as("best_score"),
          nearest: sql<number | null>`min(${matches.walkMinutes})`.as("nearest"),
          anyMatched: sql<number>`max(${matches.matched})`.as("any_matched"),
        })
        .from(matches)
        .where(q.profileId === undefined ? undefined : eq(matches.profileId, q.profileId))
        .groupBy(matches.listingId)
        .as("agg");

      const conditions = [];
      if (q.scope === "matched") conditions.push(eq(agg.anyMatched, 1));
      if (!q.includeGone) conditions.push(eq(listings.status, "active"));
      if (!q.includeHidden) conditions.push(or(eq(listingState.hidden, false), sql`${listingState.hidden} is null`));
      if (q.stage !== undefined) {
        conditions.push(
          q.stage === "new"
            ? or(eq(listingState.stage, "new"), sql`${listingState.stage} is null`)
            : eq(listingState.stage, q.stage),
        );
      }
      if (q.starred !== undefined) conditions.push(eq(listingState.starred, q.starred));
      if (q.sourceId !== undefined) {
        conditions.push(
          sql`exists (select 1 from ${listingSources} ls where ls.listing_id = ${listings.id} and ls.source_id = ${q.sourceId})`,
        );
      }
      const needle = q.q?.trim().toLowerCase();
      if (needle !== undefined && needle !== "") {
        conditions.push(
          or(
            like(sql`lower(${listings.title})`, `%${needle}%`),
            like(sql`lower(coalesce(${listings.address}, ''))`, `%${needle}%`),
            like(sql`lower(coalesce(${listings.description}, ''))`, `%${needle}%`),
          ),
        );
      }
      const where = conditions.length === 0 ? undefined : and(...conditions);

      const order = {
        newest: desc(listings.firstSeenAt),
        score: desc(sql`coalesce(${agg.bestScore}, -1)`),
        priceAsc: asc(sql`coalesce(${listings.price}, 1e9)`),
        priceDesc: desc(sql`coalesce(${listings.price}, -1)`),
        distance: asc(sql`coalesce(${agg.nearest}, 1e9)`),
      }[q.sort];

      const total = db
        .select({ n: sql<number>`count(*)` })
        .from(listings)
        .leftJoin(agg, eq(agg.listingId, listings.id))
        .leftJoin(listingState, eq(listingState.listingId, listings.id))
        .where(where)
        .get();

      const rows = db
        .select({ listing: listings })
        .from(listings)
        .leftJoin(agg, eq(agg.listingId, listings.id))
        .leftJoin(listingState, eq(listingState.listingId, listings.id))
        .where(where)
        .orderBy(order, desc(listings.firstSeenAt))
        .limit(q.limit)
        .offset(q.offset)
        .all();

      return { rows: hydrate(rows.map((r) => r.listing)), total: total?.n ?? 0 };
    },

    countActive(): number {
      return db.select({ n: sql<number>`count(*)` }).from(listings).where(eq(listings.status, "active")).get()?.n ?? 0;
    },

    countNewSince(iso: string): number {
      return (
        db
          .select({ n: sql<number>`count(*)` })
          .from(listings)
          .where(sql`${listings.firstSeenAt} >= ${iso}`)
          .get()?.n ?? 0
      );
    },

    /** Every stage is present, including the empty ones, because the Stats contract requires it. */
    countByStage(): Record<Stage, number> {
      const out = Object.fromEntries(STAGES.map((stage) => [stage, 0])) as Record<Stage, number>;
      const rows = db
        .select({ stage: sql<string>`coalesce(${listingState.stage}, 'new')`, n: sql<number>`count(*)` })
        .from(listings)
        .leftJoin(listingState, eq(listingState.listingId, listings.id))
        .groupBy(sql`coalesce(${listingState.stage}, 'new')`)
        .all();
      for (const row of rows) out[StageSchema.parse(row.stage)] = row.n;
      return out;
    },
  };
}

export type ListingRepo = ReturnType<typeof createListingRepo>;
