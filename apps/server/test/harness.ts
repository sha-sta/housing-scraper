import { ProfileSchema, type Profile, type RawListingInput, type ServerEvent } from "@housing/shared";
import type { SourceAdapter, SourceContext } from "@housing/sources";
import { createEventBus, type EventBus } from "../src/api/events.ts";
import type { Repos, StoredSource } from "../src/db/repo/index.ts";
import { newId } from "../src/ids.ts";
import { silentLogger } from "../src/log.ts";
import { createNotifier, type Notifier } from "../src/notify/notifier.ts";
import type { NtfyMessage } from "../src/notify/ntfy.ts";
import type { PushContext } from "../src/notify/push.ts";
import { createDraftService, type DraftService } from "../src/outreach/drafts.ts";
import { createJsonMailer, createMailer, type Mailer } from "../src/outreach/mailer.ts";
import { createPipeline, type Pipeline } from "../src/pipeline/run.ts";
import { seed } from "../src/seed.ts";
import { makePreferences, NOW, openTempDb, type TempDb } from "./helpers.ts";

export const TEST_SECRET = "test-secret";
export const TEST_COMMAND_TOPIC = "test-command-topic";

export interface Harness {
  db: TempDb;
  repos: Repos;
  bus: EventBus;
  notifier: Notifier;
  drafts: DraftService;
  pipeline: Pipeline;
  mailer: Mailer;
  published: NtfyMessage[];
  events: ServerEvent[];
  sentMail: string[];
  pushContext(): PushContext;
  close(): void;
}

export interface HarnessOptions {
  adapters?: SourceAdapter[];
  smtp?: boolean;
  dailyBudget?: number;
}

export function createHarness(options: HarnessOptions = {}): Harness {
  const db = openTempDb();
  const repos = db.repos;
  const bus = createEventBus();
  const published: NtfyMessage[] = [];
  const events: ServerEvent[] = [];
  const sentMail: string[] = [];

  bus.subscribe((event) => events.push(event));
  seed({ repos, adapters: options.adapters ?? [], defaultDashboardUrl: "http://localhost:4747" });

  const mailer = options.smtp === true ? createJsonMailer("me@example.edu", (j) => sentMail.push(j)) : createMailer(null);

  const notifier = createNotifier({
    notify: repos.notify,
    config: repos.config,
    ntfy: {
      publish: async (message) => {
        published.push(message);
      },
    },
    bus,
    log: silentLogger(),
    dailyBudget: options.dailyBudget ?? 200,
    loadProfile: (id) => repos.profiles.get(id),
  });

  const drafts = createDraftService({
    repos,
    bus,
    mailer,
    personalizer: { personalize: async () => null },
    notifier,
    log: silentLogger(),
  });

  const pushContext = (): PushContext => ({
    dashboardUrl: "http://localhost:4747",
    ntfyServer: "https://ntfy.sh",
    commandTopic: TEST_COMMAND_TOPIC,
    appSecret: TEST_SECRET,
    smtpConfigured: mailer.configured,
  });

  const pipeline = createPipeline({
    repos,
    bus,
    notifier,
    drafts,
    geocoder: { lookup: async () => null },
    router: { walkMinutes: async () => null },
    log: silentLogger(),
    pushContext,
  });

  return {
    db,
    repos,
    bus,
    notifier,
    drafts,
    pipeline,
    mailer,
    published,
    events,
    sentMail,
    pushContext,
    close: () => db.close(),
  };
}

export function addProfile(harness: Harness, overrides: Partial<Profile> = {}): Profile {
  const profile = ProfileSchema.parse({
    id: newId("prf"),
    name: "Row home for 6",
    enabled: true,
    color: "#2563eb",
    preferences: makePreferences((p) => ({
      ...p,
      group: { size: 6 },
      beds: { ...p.beds, min: 1 },
      location: { ...p.location, maxWalkMinutes: 60, idealWalkMinutes: 10 },
      notify: { ...p.notify, topic: "owner-topic", minScore: 0 },
      outreach: { ...p.outreach, minScore: 0 },
    })),
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  });
  harness.repos.profiles.insert(profile);
  return profile;
}

/** A source row whose baseline is already done, so runs take the normal push path. */
export function addSource(harness: Harness, id: string, baselineDone = true): StoredSource {
  const existing = harness.repos.config.getSource(id);
  if (existing !== null) {
    if (baselineDone) harness.repos.config.updateSource(id, { baselineAt: NOW.toISOString() });
    return harness.repos.config.getSource(id) ?? existing;
  }
  const source: StoredSource = {
    id,
    name: `Fake ${id}`,
    kind: "http",
    homepage: "https://example.com",
    enabled: true,
    intervalSec: 300,
    config: {},
    needsSetup: false,
    setupHint: null,
    lastRunAt: null,
    lastSuccessAt: null,
    lastError: null,
    consecutiveFailures: 0,
    lastRunCount: 0,
    totalListings: 0,
    baselineAt: baselineDone ? NOW.toISOString() : null,
    disabledAt: null,
    backoffUntil: null,
    downNotifiedAt: null,
  };
  harness.repos.config.insertSource(source);
  return source;
}

export function fakeAdapter(id: string, next: () => RawListingInput[]): SourceAdapter {
  return {
    id,
    name: `Fake ${id}`,
    kind: "http",
    homepage: "https://example.com",
    defaultIntervalSec: 300,
    defaultEnabled: true,
    defaultConfig: {},
    needsSetup: async () => null,
    search: async () => next(),
  };
}

export function fakeContext(): SourceContext {
  return {
    area: {
      center: { lat: 39.3299, lon: -76.6205 },
      radiusMiles: 2,
      bbox: { minLat: 39.3, minLon: -76.65, maxLat: 39.36, maxLon: -76.59 },
      zips: ["21218"],
      neighborhoods: ["Charles Village"],
    },
    hints: { minBeds: null, maxPrice: null },
    config: {},
    http: {
      fetch: async () => {
        throw new Error("the fake adapter never makes HTTP calls");
      },
    },
    browser: {
      newPage: async () => {
        throw new Error("the fake adapter never opens a browser");
      },
    },
    log: silentLogger(),
    signal: new AbortController().signal,
    isKnown: () => false,
  };
}

/** Runs the source and returns the source row, refreshed, the way the scheduler leaves it. */
export async function runOnce(harness: Harness, adapter: SourceAdapter): Promise<void> {
  const source = harness.repos.config.getSource(adapter.id);
  if (source === null) throw new Error(`no source row for ${adapter.id}`);
  await harness.pipeline.runSource(adapter, source, fakeContext());
  harness.repos.config.updateSource(adapter.id, { baselineAt: source.baselineAt ?? new Date().toISOString() });
}
