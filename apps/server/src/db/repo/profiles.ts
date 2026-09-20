import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  FilterReasonSchema,
  PreferencesSchema,
  ProfileSchema,
  ScoreBreakdownSchema,
  type Match,
  type Profile,
} from "@housing/shared";
import { z } from "zod";
import type { Db } from "../client.ts";
import { parseColumn, toColumn } from "../json.ts";
import { matches, profiles } from "../schema.ts";

const RejectedBySchema = z.array(FilterReasonSchema);

type ProfileRow = typeof profiles.$inferSelect;
type MatchRow = typeof matches.$inferSelect;

export interface StoredMatch extends Match {
  notifiedAt: string | null;
}

function toProfile(row: ProfileRow): Profile {
  return ProfileSchema.parse({
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    color: row.color,
    preferences: parseColumn(PreferencesSchema, row.preferencesJson, "profiles.preferences_json"),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function toMatch(row: MatchRow): StoredMatch {
  return {
    listingId: row.listingId,
    profileId: row.profileId,
    matched: row.matched,
    rejectedBy: parseColumn(RejectedBySchema, row.rejectedByJson, "matches.rejected_by_json"),
    score: row.score,
    breakdown: parseColumn(ScoreBreakdownSchema, row.breakdownJson, "matches.breakdown_json"),
    monthlyTotal: row.monthlyTotal,
    pricePerPerson: row.pricePerPerson,
    walkMinutes: row.walkMinutes,
    distanceMiles: row.distanceMiles,
    notifiedAt: row.notifiedAt,
  };
}

export function createProfileRepo(db: Db) {
  return {
    list(): Profile[] {
      return db.select().from(profiles).all().map(toProfile);
    },

    enabled(): Profile[] {
      return db.select().from(profiles).where(eq(profiles.enabled, true)).all().map(toProfile);
    },

    get(id: string): Profile | null {
      const row = db.select().from(profiles).where(eq(profiles.id, id)).get();
      return row === undefined ? null : toProfile(row);
    },

    insert(profile: Profile): void {
      db
        .insert(profiles)
        .values({
          id: profile.id,
          name: profile.name,
          enabled: profile.enabled,
          color: profile.color,
          preferencesJson: toColumn(profile.preferences),
          createdAt: profile.createdAt,
          updatedAt: profile.updatedAt,
        })
        .run();
    },

    update(profile: Profile): void {
      db
        .update(profiles)
        .set({
          name: profile.name,
          enabled: profile.enabled,
          color: profile.color,
          preferencesJson: toColumn(profile.preferences),
          updatedAt: profile.updatedAt,
        })
        .where(eq(profiles.id, profile.id))
        .run();
    },

    remove(id: string): void {
      db.delete(profiles).where(eq(profiles.id, id)).run();
    },

    getMatch(listingId: string, profileId: string): StoredMatch | null {
      const row = db
        .select()
        .from(matches)
        .where(and(eq(matches.listingId, listingId), eq(matches.profileId, profileId)))
        .get();
      return row === undefined ? null : toMatch(row);
    },

    matchesFor(listingIds: string[]): Map<string, StoredMatch[]> {
      const out = new Map<string, StoredMatch[]>();
      if (listingIds.length === 0) return out;
      for (const row of db.select().from(matches).where(inArray(matches.listingId, listingIds)).all()) {
        const bucket = out.get(row.listingId);
        if (bucket === undefined) out.set(row.listingId, [toMatch(row)]);
        else bucket.push(toMatch(row));
      }
      return out;
    },

    /** Upsert keeps notified_at, which is what stops a profile edit from re-pushing old listings. */
    saveMatch(match: Match, at: string): void {
      const values = {
        listingId: match.listingId,
        profileId: match.profileId,
        matched: match.matched,
        rejectedByJson: toColumn(match.rejectedBy),
        score: match.score,
        breakdownJson: toColumn(match.breakdown),
        monthlyTotal: match.monthlyTotal,
        pricePerPerson: match.pricePerPerson,
        walkMinutes: match.walkMinutes,
        distanceMiles: match.distanceMiles,
        updatedAt: at,
      };
      db
        .insert(matches)
        .values({ ...values, notifiedAt: null })
        .onConflictDoUpdate({ target: [matches.listingId, matches.profileId], set: values })
        .run();
    },

    markNotified(listingId: string, profileId: string, at: string): void {
      db
        .update(matches)
        .set({ notifiedAt: at })
        .where(and(eq(matches.listingId, listingId), eq(matches.profileId, profileId)))
        .run();
    },

    markManyNotified(profileId: string, listingIds: string[], at: string): void {
      if (listingIds.length === 0) return;
      db
        .update(matches)
        .set({ notifiedAt: at })
        .where(and(eq(matches.profileId, profileId), inArray(matches.listingId, listingIds)))
        .run();
    },

    /** Matches that have never pushed. The pipeline turns these into pushes or into a baseline summary. */
    unnotifiedMatches(profileId: string, minScore: number): StoredMatch[] {
      return db
        .select()
        .from(matches)
        .where(
          and(
            eq(matches.profileId, profileId),
            eq(matches.matched, true),
            isNull(matches.notifiedAt),
            sql`${matches.score} >= ${minScore}`,
          ),
        )
        .all()
        .map(toMatch);
    },

    countMatchedListings(): number {
      return (
        db
          .select({ n: sql<number>`count(distinct ${matches.listingId})` })
          .from(matches)
          .where(eq(matches.matched, true))
          .get()?.n ?? 0
      );
    },
  };
}

export type ProfileRepo = ReturnType<typeof createProfileRepo>;
