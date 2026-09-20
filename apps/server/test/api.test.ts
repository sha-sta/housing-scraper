import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  defaultPreferences,
  ListingPageSchema,
  ListingViewSchema,
  ProfileSchema,
  SettingsSchema,
  SourceStatusSchema,
  StatsSchema,
  type Draft,
  type Profile,
  type ProfileWrite,
} from "@housing/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/api/app.ts";
import { silentLogger } from "../src/log.ts";
import { addProfile, createHarness, fakeAdapter, runOnce, type Harness } from "./harness.ts";
import { HOMEWOOD, makeListing } from "./helpers.ts";

const JSON_HEADERS = new Headers({ "content-type": "application/json" });

function profileWrite(overrides: Partial<ProfileWrite> = {}): ProfileWrite {
  const preferences = defaultPreferences(HOMEWOOD);
  return {
    name: "Apartment for 4",
    enabled: true,
    color: "#2563eb",
    preferences: {
      ...preferences,
      beds: { ...preferences.beds, min: 1 },
      location: { ...preferences.location, maxWalkMinutes: 60 },
      notify: { ...preferences.notify, topic: "owner-topic", minScore: 0 },
    },
    ...overrides,
  };
}

let harness: Harness;
let app: Hono;
let webDir: string | null = null;
let ranSources: string[] = [];

function buildApp(options: { password?: string | null; webDistDir?: string | null } = {}): Hono {
  return createApp({
    repos: harness.repos,
    bus: harness.bus,
    pipeline: harness.pipeline,
    drafts: harness.drafts,
    mailer: harness.mailer,
    notifier: harness.notifier,
    log: silentLogger(),
    runSourceNow: async (sourceId) => {
      ranSources.push(sourceId);
    },
    dashboardPassword: options.password ?? null,
    llmConfigured: false,
    ntfyCommandTopicConfigured: true,
    webDistDir: options.webDistDir ?? null,
  });
}

beforeEach(() => {
  harness = createHarness();
  ranSources = [];
  app = buildApp();
});

afterEach(() => {
  harness.close();
  if (webDir !== null) rmSync(webDir, { recursive: true, force: true });
  webDir = null;
});

describe("GET /api/health", () => {
  it("answers with ok and a version", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: "0.1.0" });
  });
});

describe("settings", () => {
  it("returns the seeded settings with the derived flags", async () => {
    const res = await app.request("/api/settings");
    expect(res.status).toBe(200);
    const settings = SettingsSchema.parse(await res.json());
    expect(settings.campusId).toBe("homewood");
    expect(settings.composeVia).toBe("mailto");
    expect(settings.smtpConfigured).toBe(false);
    expect(settings.ntfyCommandTopicConfigured).toBe(true);
  });

  it("patches only what it is given", async () => {
    const res = await app.request("/api/settings", {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ composeVia: "outlook", identity: { fullName: "Sam Rivera" } }),
    });
    expect(res.status).toBe(200);
    const settings = SettingsSchema.parse(await res.json());
    expect(settings.composeVia).toBe("outlook");
    expect(settings.identity.fullName).toBe("Sam Rivera");
    expect(settings.ntfyServer).toBe("https://ntfy.sh");
  });

  it("rejects a bad patch", async () => {
    const res = await app.request("/api/settings", {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ composeVia: "pigeon" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("campuses and stats", () => {
  it("lists the campus presets", async () => {
    const res = await app.request("/api/campuses");
    const body: unknown = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(JSON.stringify(body)).toContain("homewood");
  });

  it("reports stats in the documented shape", async () => {
    const res = await app.request("/api/stats");
    expect(StatsSchema.parse(await res.json()).activeListings).toBe(0);
  });
});

describe("profiles", () => {
  it("creates, lists, updates, previews, and deletes", async () => {
    const created = await app.request("/api/profiles", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(profileWrite()),
    });
    expect(created.status).toBe(201);
    const profile: Profile = ProfileSchema.parse(await created.json());
    expect(profile.name).toBe("Apartment for 4");

    const listed = await app.request("/api/profiles");
    expect((await listed.json() as unknown[]).length).toBe(1);

    const updated = await app.request(`/api/profiles/${profile.id}`, {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify(profileWrite({ name: "Apartment for 5" })),
    });
    expect(ProfileSchema.parse(await updated.json()).name).toBe("Apartment for 5");

    const preview = await app.request("/api/profiles/preview", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(profileWrite()),
    });
    expect(await preview.json()).toEqual({ matched: 0, total: 0, topRejectReasons: [] });

    const removed = await app.request(`/api/profiles/${profile.id}`, { method: "DELETE" });
    expect(removed.status).toBe(204);
    expect((await (await app.request("/api/profiles")).json() as unknown[]).length).toBe(0);
  });

  it("rejects a profile with no name", async () => {
    const res = await app.request("/api/profiles", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(profileWrite({ name: "" })),
    });
    expect(res.status).toBe(400);
  });

  it("404s on an unknown profile", async () => {
    const res = await app.request("/api/profiles/nope", {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify(profileWrite()),
    });
    expect(res.status).toBe(404);
  });

  it("counts reject reasons in a preview", async () => {
    await seedListing();
    const res = await app.request("/api/profiles/preview", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(
        profileWrite({
          preferences: {
            ...profileWrite().preferences,
            beds: { min: 20, max: null, allowUnknown: false },
          },
        }),
      ),
    });
    const body = await res.json() as { matched: number; total: number; topRejectReasons: [string, number][] };
    expect(body.total).toBe(1);
    expect(body.matched).toBe(0);
    expect(body.topRejectReasons[0]?.[0]).toBe("bedsOutOfRange");
  });
});

async function seedListing(): Promise<void> {
  addProfile(harness);
  harness.repos.config.insertSource({
    id: "fake",
    name: "Fake",
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
    baselineAt: new Date().toISOString(),
    disabledAt: null,
    backoffUntil: null,
    downNotifiedAt: null,
  });
  const adapter = fakeAdapter("fake", () => [
    {
      sourceId: "fake",
      sourceListingId: "unit-1",
      url: "https://example.com/fake/unit-1",
      title: "5 BR row home on Guilford Ave",
      description: "Bright row home. Email leasing@example.com for a tour.",
      price: 3000,
      beds: 5,
      propertyType: "rowhome",
      address: "3210 Guilford Ave, Baltimore, MD 21218",
      lat: 39.3285,
      lon: -76.6149,
      photos: ["https://example.com/photo.jpg"],
    },
  ]);
  await runOnce(harness, adapter);
}

describe("listings", () => {
  it("returns a page in the documented shape", async () => {
    await seedListing();
    const res = await app.request("/api/listings?limit=10");
    const page = ListingPageSchema.parse(await res.json());
    expect(page.total).toBe(1);
    expect(page.items[0]?.listing.address).toBe("3210 Guilford Ave, Baltimore, MD 21218");
    expect(page.items[0]?.state.stage).toBe("new");
    expect(page.items[0]?.matches).toHaveLength(1);
    expect(page.items[0]?.draftIds).toHaveLength(1);
  });

  it("filters by stage, search text, and source", async () => {
    await seedListing();
    expect(ListingPageSchema.parse(await (await app.request("/api/listings?q=guilford")).json()).total).toBe(1);
    expect(ListingPageSchema.parse(await (await app.request("/api/listings?q=nowhere")).json()).total).toBe(0);
    expect(ListingPageSchema.parse(await (await app.request("/api/listings?sourceId=fake")).json()).total).toBe(1);
    expect(ListingPageSchema.parse(await (await app.request("/api/listings?sourceId=other")).json()).total).toBe(0);
    expect(ListingPageSchema.parse(await (await app.request("/api/listings?stage=applied")).json()).total).toBe(0);
  });

  it("reads the boolean query flags as written rather than coercing every string to true", async () => {
    await seedListing();
    const id = harness.repos.listings.active()[0]!.id;
    harness.repos.listings.setStatus([id], "gone");

    const hiddenOne = ListingPageSchema.parse(await (await app.request("/api/listings?includeGone=false")).json());
    expect(hiddenOne.total).toBe(0);
    const shownOne = ListingPageSchema.parse(await (await app.request("/api/listings?includeGone=true")).json());
    expect(shownOne.total).toBe(1);

    harness.repos.listings.setStatus([id], "active");
    harness.repos.listings.setState(
      id,
      { stage: "new", starred: false, hidden: true, notes: "" },
      new Date().toISOString(),
    );
    expect(ListingPageSchema.parse(await (await app.request("/api/listings?includeHidden=false")).json()).total).toBe(0);
    expect(ListingPageSchema.parse(await (await app.request("/api/listings?includeHidden=true")).json()).total).toBe(1);
    expect(ListingPageSchema.parse(await (await app.request("/api/listings")).json()).total).toBe(0);

    expect(
      ListingPageSchema.parse(await (await app.request("/api/listings?includeHidden=true&starred=false")).json()).total,
    ).toBe(1);
    expect(
      ListingPageSchema.parse(await (await app.request("/api/listings?includeHidden=true&starred=true")).json()).total,
    ).toBe(0);
  });

  it("ranks the price sorts by whole unit rent, not by the raw number on the card", async () => {
    const profile = addProfile(harness);
    const base = { photos: ["https://example.com/p.jpg"], lat: 39.3285, lon: -76.6149 };
    // The per-room row home costs 4,250 a month and belongs between the other two.
    harness.repos.listings.insert(
      makeListing({ ...base, id: "lst_cheap", title: "Cheap", price: 3000, beds: 5, priceBasis: "unit" }),
    );
    harness.repos.listings.insert(
      makeListing({ ...base, id: "lst_perRoom", title: "Per room", price: 850, beds: 5, priceBasis: "room" }),
    );
    harness.repos.listings.insert(
      makeListing({ ...base, id: "lst_dear", title: "Dear", price: 5000, beds: 5, priceBasis: "unit" }),
    );
    harness.repos.listings.insert(
      makeListing({ ...base, id: "lst_noPrice", title: "No price", price: null, beds: 5, priceBasis: "unit" }),
    );

    const ids = async (query: string): Promise<string[]> => {
      const page = ListingPageSchema.parse(await (await app.request(`/api/listings?${query}`)).json());
      return page.items.map((item) => item.listing.id);
    };

    // Without a profile the rent is computed from price and beds.
    expect(await ids("scope=all&sort=priceAsc")).toEqual([
      "lst_cheap",
      "lst_perRoom",
      "lst_dear",
      "lst_noPrice",
    ]);
    expect(await ids("scope=all&sort=priceDesc")).toEqual([
      "lst_dear",
      "lst_perRoom",
      "lst_cheap",
      "lst_noPrice",
    ]);

    // With a profile the stored Match.monthlyTotal drives the same order.
    await harness.pipeline.evaluateAll(profile, "silent");
    expect(harness.repos.profiles.getMatch("lst_perRoom", profile.id)?.monthlyTotal).toBe(4250);
    expect(await ids(`scope=all&profileId=${profile.id}&sort=priceAsc`)).toEqual([
      "lst_cheap",
      "lst_perRoom",
      "lst_dear",
      "lst_noPrice",
    ]);
    expect(await ids(`scope=all&profileId=${profile.id}&sort=priceDesc`)).toEqual([
      "lst_dear",
      "lst_perRoom",
      "lst_cheap",
      "lst_noPrice",
    ]);
  });

  it("rejects a query outside the documented bounds", async () => {
    expect((await app.request("/api/listings?limit=9999")).status).toBe(400);
    expect((await app.request("/api/listings?sort=sideways")).status).toBe(400);
  });

  it("fetches one listing and patches its state", async () => {
    await seedListing();
    const id = harness.repos.listings.active()[0]!.id;

    const single = await app.request(`/api/listings/${id}`);
    expect(ListingViewSchema.parse(await single.json()).listing.id).toBe(id);

    const patched = await app.request(`/api/listings/${id}/state`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ starred: true, stage: "interested", notes: "Call them" }),
    });
    const view = ListingViewSchema.parse(await patched.json());
    expect(view.state.starred).toBe(true);
    expect(view.state.stage).toBe("interested");
    expect(view.state.notes).toBe("Call them");
    expect(harness.events.some((e) => e.type === "listing.state")).toBe(true);
  });

  it("404s on an unknown listing", async () => {
    expect((await app.request("/api/listings/nope")).status).toBe(404);
    expect(
      (
        await app.request("/api/listings/nope/state", {
          method: "PATCH",
          headers: JSON_HEADERS,
          body: JSON.stringify({ starred: true }),
        })
      ).status,
    ).toBe(404);
  });
});

describe("drafts", () => {
  it("lists, patches, marks sent, and discards", async () => {
    await seedListing();
    const listingId = harness.repos.listings.active()[0]!.id;

    const all = (await (await app.request("/api/drafts")).json()) as Draft[];
    expect(all).toHaveLength(1);
    const draft = all[0]!;
    expect((await (await app.request(`/api/drafts/${draft.id}`)).json() as Draft).id).toBe(draft.id);

    const patched = (await (
      await app.request(`/api/drafts/${draft.id}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ subject: "Edited subject" }),
      })
    ).json()) as Draft;
    expect(patched.subject).toBe("Edited subject");

    const marked = (await (await app.request(`/api/drafts/${draft.id}/mark-sent`, { method: "POST" })).json()) as Draft;
    expect(marked.status).toBe("sent");
    expect(harness.repos.listings.getState(listingId).stage).toBe("contacted");

    const regenerated = await app.request(`/api/listings/${listingId}/drafts`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ profileId: harness.repos.profiles.list()[0]!.id }),
    });
    expect(regenerated.status).toBe(201);

    const newDraft = (await regenerated.json()) as Draft;
    expect((await app.request(`/api/drafts/${newDraft.id}`, { method: "DELETE" })).status).toBe(204);
    expect(harness.repos.outreach.getDraft(newDraft.id)?.status).toBe("discarded");
  });

  it("refuses to send when SMTP is off", async () => {
    await seedListing();
    const draft = harness.repos.outreach.listDrafts("staged")[0]!;
    const res = await app.request(`/api/drafts/${draft.id}/send`, { method: "POST" });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "SMTP is not configured" });
  });

  it("sends over SMTP and refuses a second email to the same address", async () => {
    harness.close();
    harness = createHarness({ smtp: true });
    app = buildApp();
    await seedListing();

    const draft = harness.repos.outreach.listDrafts("staged")[0]!;
    const sent = (await (await app.request(`/api/drafts/${draft.id}/send`, { method: "POST" })).json()) as Draft;
    expect(sent.status).toBe("sent");
    expect(harness.sentMail).toHaveLength(1);

    const listingId = draft.listingId;
    const again = await app.request(`/api/listings/${listingId}/drafts`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ profileId: harness.repos.profiles.list()[0]!.id }),
    });
    const second = (await again.json()) as Draft;
    const blocked = await app.request(`/api/drafts/${second.id}/send`, { method: "POST" });
    expect(blocked.status).toBe(422);
    expect(await blocked.json()).toEqual({
      error: "this listing already had an email sent to that address",
    });
    expect(harness.sentMail).toHaveLength(1);
  });

  it("404s on an unknown draft", async () => {
    expect((await app.request("/api/drafts/nope")).status).toBe(404);
    expect((await app.request("/api/drafts/nope", { method: "DELETE" })).status).toBe(404);
    expect((await app.request("/api/drafts/nope/send", { method: "POST" })).status).toBe(422);
  });
});

describe("templates", () => {
  it("lists the two seeded templates and supports the full cycle", async () => {
    const seeded = (await (await app.request("/api/templates")).json()) as { id: string; name: string }[];
    expect(seeded.map((t) => t.name).sort()).toEqual(["Group intro", "Short and direct"]);

    const created = await app.request("/api/templates", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: "Mine", subject: "Hi", body: "Hello {{contact.name}}" }),
    });
    expect(created.status).toBe(201);
    const template = (await created.json()) as { id: string };

    const updated = await app.request(`/api/templates/${template.id}`, {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: "Mine v2", subject: "Hi", body: "Hello" }),
    });
    expect(((await updated.json()) as { name: string }).name).toBe("Mine v2");

    expect((await app.request(`/api/templates/${template.id}`, { method: "DELETE" })).status).toBe(204);
    expect(harness.repos.outreach.countTemplates()).toBe(2);
  });

  it("rejects a template with no name", async () => {
    const res = await app.request("/api/templates", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: "", subject: "", body: "" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("notifications", () => {
  it("lists, filters unread, and marks read", async () => {
    await seedListing();
    const all = (await (await app.request("/api/notifications")).json()) as unknown[];
    expect(all.length).toBeGreaterThan(0);

    const unread = (await (await app.request("/api/notifications?unread=true")).json()) as unknown[];
    expect(unread.length).toBe(all.length);

    expect(
      (
        await app.request("/api/notifications/read", {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({}),
        })
      ).status,
    ).toBe(204);
    expect(((await (await app.request("/api/notifications?unread=true")).json()) as unknown[]).length).toBe(0);
  });
});

describe("sources", () => {
  it("lists, patches, and runs now", async () => {
    await seedListing();
    const listed = (await (await app.request("/api/sources")).json()) as unknown[];
    expect(listed).toHaveLength(1);
    expect(SourceStatusSchema.parse(listed[0]).id).toBe("fake");

    const patched = await app.request("/api/sources/fake", {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ enabled: false, intervalSec: 600 }),
    });
    const status = SourceStatusSchema.parse(await patched.json());
    expect(status.enabled).toBe(false);
    expect(status.intervalSec).toBe(600);
    expect(harness.repos.config.getSource("fake")?.disabledAt).not.toBeNull();

    const ran = await app.request("/api/sources/fake/run", { method: "POST" });
    expect(ran.status).toBe(200);
    expect(ranSources).toEqual(["fake"]);
  });

  it("rebaselines a source that was off for more than a day", async () => {
    await seedListing();
    const longAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    harness.repos.config.updateSource("fake", { enabled: false, disabledAt: longAgo });

    await app.request("/api/sources/fake", {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ enabled: true }),
    });
    const source = harness.repos.config.getSource("fake");
    expect(source?.baselineAt).toBeNull();
    expect(source?.disabledAt).toBeNull();
  });

  it("keeps the baseline for a short pause", async () => {
    await seedListing();
    harness.repos.config.updateSource("fake", { enabled: false, disabledAt: new Date().toISOString() });
    await app.request("/api/sources/fake", {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ enabled: true }),
    });
    expect(harness.repos.config.getSource("fake")?.baselineAt).not.toBeNull();
  });

  it("rejects an interval below the documented floor and 404s an unknown source", async () => {
    expect(
      (
        await app.request("/api/sources/fake", {
          method: "PATCH",
          headers: JSON_HEADERS,
          body: JSON.stringify({ intervalSec: 5 }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await app.request("/api/sources/nope", {
          method: "PATCH",
          headers: JSON_HEADERS,
          body: JSON.stringify({ enabled: true }),
        })
      ).status,
    ).toBe(404);
    expect((await app.request("/api/sources/nope/run", { method: "POST" })).status).toBe(404);
  });
});

describe("test endpoints", () => {
  it("pushes a test notification to a profile topic", async () => {
    const profile = addProfile(harness);
    const res = await app.request("/api/test/ntfy", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ profileId: profile.id }),
    });
    expect(await res.json()).toEqual({ ok: true });
    expect(harness.published.at(-1)?.title).toBe("Test push");
  });

  it("reports the SMTP state without throwing", async () => {
    const res = await app.request("/api/test/smtp", { method: "POST" });
    expect(await res.json()).toEqual({ ok: false, error: "SMTP is not configured." });
  });
});

describe("GET /api/events", () => {
  it("streams the ready frame and then each event", async () => {
    const res = await app.request("/api/events");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    const first = await reader.read();
    expect(decoder.decode(first.value)).toContain("event: ready");

    harness.bus.publish({ type: "profiles.changed" });
    const second = await reader.read();
    const frame = decoder.decode(second.value);
    expect(frame).toContain("event: message");
    expect(frame).toContain('{"type":"profiles.changed"}');
    await reader.cancel();
  });
});

describe("basic auth", () => {
  it("challenges without credentials and passes with the password", async () => {
    const guarded = buildApp({ password: "hunter2" });
    const denied = await guarded.request("/api/health");
    expect(denied.status).toBe(401);
    expect(denied.headers.get("www-authenticate")).toContain("Basic");

    const allowed = await guarded.request("/api/health", {
      headers: { authorization: `Basic ${Buffer.from("anyone:hunter2").toString("base64")}` },
    });
    expect(allowed.status).toBe(200);

    const wrong = await guarded.request("/api/health", {
      headers: { authorization: `Basic ${Buffer.from("anyone:nope").toString("base64")}` },
    });
    expect(wrong.status).toBe(401);
  });
});

describe("static dashboard", () => {
  it("serves the built files and falls back to the shell for a client route", async () => {
    webDir = mkdtempSync(join(tmpdir(), "housing-web-"));
    mkdirSync(join(webDir, "assets"), { recursive: true });
    writeFileSync(join(webDir, "index.html"), "<!doctype html><title>Dashboard</title>", "utf8");
    writeFileSync(join(webDir, "assets", "app.js"), "export const ok = 1;\n", "utf8");

    const served = buildApp({ webDistDir: webDir });
    const shell = await served.request("/");
    expect(shell.status).toBe(200);
    expect(await shell.text()).toContain("Dashboard");

    const asset = await served.request("/assets/app.js");
    expect(asset.status).toBe(200);
    expect(await asset.text()).toContain("export const ok");

    const deep = await served.request("/listings/lst_123");
    expect(deep.status).toBe(200);
    expect(await deep.text()).toContain("Dashboard");

    // The API still answers as JSON rather than the shell.
    expect((await served.request("/api/listings/nope")).status).toBe(404);
  });
});

describe("unknown routes", () => {
  it("answers with a JSON error", async () => {
    const res = await app.request("/api/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not found" });
  });
});
