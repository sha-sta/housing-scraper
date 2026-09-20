import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  defaultPreferences,
  ProfileSchema,
  type Listing,
  type Preferences,
  type Profile,
} from "@housing/shared";
import { openDb, type DbHandle } from "../src/db/client.ts";
import { createRepos, type Repos } from "../src/db/repo/index.ts";

export const HOMEWOOD = { label: "JHU Homewood", lat: 39.3299, lon: -76.6205 };
export const NOW = new Date("2026-09-20T12:00:00.000Z");

export function makeListing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: "lst_test",
    title: "5 BR row home on Guilford Ave",
    description: "Bright row home two blocks from campus.",
    price: 3000,
    priceMax: null,
    priceBasis: "unit",
    beds: 5,
    bedsMax: null,
    baths: 2,
    sqft: 1800,
    propertyType: "rowhome",
    isSublet: false,
    incomeRestricted: false,
    seniorHousing: false,
    address: "3210 Guilford Ave, Baltimore, MD 21218",
    neighborhood: "Charles Village",
    zip: "21218",
    // Roughly 0.44 miles from the Homewood anchor.
    lat: 39.3285,
    lon: -76.6149,
    availableDate: "2027-06-01",
    leaseMonths: 12,
    photos: ["https://example.com/photo.jpg"],
    amenities: {},
    contact: { name: null, company: null, email: null, phone: null, formUrl: null },
    scamSignals: [],
    sources: [{ sourceId: "demo", sourceListingId: "unit-1", url: "https://example.com/unit-1" }],
    priceHistory: [],
    status: "active",
    postedAt: null,
    firstSeenAt: NOW.toISOString(),
    lastSeenAt: NOW.toISOString(),
    ...overrides,
  };
}

export function makePreferences(edit: (base: Preferences) => Preferences = (p) => p): Preferences {
  return edit(defaultPreferences(HOMEWOOD));
}

export function makeProfile(preferences: Preferences = makePreferences(), overrides: Partial<Profile> = {}): Profile {
  return ProfileSchema.parse({
    id: "prf_test",
    name: "Row home for 6",
    enabled: true,
    color: "#2563eb",
    preferences,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  });
}

export interface TempDb {
  handle: DbHandle;
  repos: Repos;
  dir: string;
  close(): void;
}

/** A real SQLite file per test, migrated the same way the server migrates on boot. */
export function openTempDb(): TempDb {
  const dir = mkdtempSync(join(tmpdir(), "housing-test-"));
  const handle = openDb(join(dir, "housing.db"));
  return {
    handle,
    repos: createRepos(handle.db),
    dir,
    close() {
      handle.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
