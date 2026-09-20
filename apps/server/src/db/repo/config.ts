import { eq, sql } from "drizzle-orm";
import {
  ComposeViaSchema,
  IdentitySchema,
  SourceKindSchema,
  type ComposeVia,
  type Identity,
  type SourceKind,
} from "@housing/shared";
import { z } from "zod";
import type { Db } from "../client.ts";
import { parseColumn, toColumn } from "../json.ts";
import { geocodeCache, routeCache, settings, sources } from "../schema.ts";


const ConfigSchema = z.record(z.string(), z.unknown());

export interface StoredSettings {
  setupComplete: boolean;
  campusId: string;
  identity: Identity;
  composeVia: ComposeVia;
  ntfyServer: string;
  dashboardUrl: string;
}

export interface StoredSource {
  id: string;
  name: string;
  kind: SourceKind;
  homepage: string;
  enabled: boolean;
  intervalSec: number;
  config: Record<string, unknown>;
  needsSetup: boolean;
  setupHint: string | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  lastRunCount: number;
  totalListings: number;
  baselineAt: string | null;
  disabledAt: string | null;
  backoffUntil: string | null;
  downNotifiedAt: string | null;
}

export interface GeocodeHit {
  lat: number | null;
  lon: number | null;
  matchedAddress: string | null;
}

type SourceRow = typeof sources.$inferSelect;

function toSource(row: SourceRow): StoredSource {
  return {
    id: row.id,
    name: row.name,
    kind: SourceKindSchema.parse(row.kind),
    homepage: row.homepage,
    enabled: row.enabled,
    intervalSec: row.intervalSec,
    config: parseColumn(ConfigSchema, row.configJson, "sources.config_json"),
    needsSetup: row.needsSetup,
    setupHint: row.setupHint,
    lastRunAt: row.lastRunAt,
    lastSuccessAt: row.lastSuccessAt,
    lastError: row.lastError,
    consecutiveFailures: row.consecutiveFailures,
    lastRunCount: row.lastRunCount,
    totalListings: row.totalListings,
    baselineAt: row.baselineAt,
    disabledAt: row.disabledAt,
    backoffUntil: row.backoffUntil,
    downNotifiedAt: row.downNotifiedAt,
  };
}

export function createConfigRepo(db: Db) {
  return {
    getSettings(): StoredSettings | null {
      const row = db.select().from(settings).where(eq(settings.id, 1)).get();
      if (row === undefined) return null;
      return {
        setupComplete: row.setupComplete,
        campusId: row.campusId,
        identity: parseColumn(IdentitySchema, row.identityJson, "settings.identity_json"),
        composeVia: ComposeViaSchema.parse(row.composeVia),
        ntfyServer: row.ntfyServer,
        dashboardUrl: row.dashboardUrl,
      };
    },

    putSettings(value: StoredSettings, at: string): void {
      const row = {
        id: 1,
        setupComplete: value.setupComplete,
        campusId: value.campusId,
        identityJson: toColumn(value.identity),
        composeVia: value.composeVia,
        ntfyServer: value.ntfyServer,
        dashboardUrl: value.dashboardUrl,
        updatedAt: at,
      };
      db.insert(settings).values(row).onConflictDoUpdate({ target: settings.id, set: row }).run();
    },

    listSources(): StoredSource[] {
      return db.select().from(sources).orderBy(sources.name).all().map(toSource);
    },

    getSource(id: string): StoredSource | null {
      const row = db.select().from(sources).where(eq(sources.id, id)).get();
      return row === undefined ? null : toSource(row);
    },

    insertSource(source: StoredSource): void {
      db
        .insert(sources)
        .values({ ...source, configJson: toColumn(source.config) })
        .run();
    },

    updateSource(id: string, patch: Partial<Omit<StoredSource, "id" | "config">> & { config?: Record<string, unknown> }): void {
      const { config, ...rest } = patch;
      const values = config === undefined ? rest : { ...rest, configJson: toColumn(config) };
      if (Object.keys(values).length === 0) return;
      db.update(sources).set(values).where(eq(sources.id, id)).run();
    },

    countSourcesDown(threshold: number): number {
      return (
        db
          .select({ n: sql<number>`count(*)` })
          .from(sources)
          .where(sql`${sources.consecutiveFailures} >= ${threshold}`)
          .get()?.n ?? 0
      );
    },

    getGeocode(addressKey: string): GeocodeHit | null {
      const row = db.select().from(geocodeCache).where(eq(geocodeCache.addressKey, addressKey)).get();
      if (row === undefined) return null;
      return { lat: row.lat, lon: row.lon, matchedAddress: row.matchedAddress };
    },

    /** Misses are cached too, so a bad address is asked about once and never again. */
    putGeocode(addressKey: string, hit: GeocodeHit, at: string): void {
      db
        .insert(geocodeCache)
        .values({ addressKey, ...hit, createdAt: at })
        .onConflictDoNothing()
        .run();
    },

    getRoute(key: string): number | null | undefined {
      const row = db.select().from(routeCache).where(eq(routeCache.key, key)).get();
      return row === undefined ? undefined : row.walkMinutes;
    },

    putRoute(key: string, walkMinutes: number | null, at: string): void {
      db
        .insert(routeCache)
        .values({ key, walkMinutes, createdAt: at })
        .onConflictDoUpdate({ target: routeCache.key, set: { walkMinutes, createdAt: at } })
        .run();
    },
  };
}

export type ConfigRepo = ReturnType<typeof createConfigRepo>;
