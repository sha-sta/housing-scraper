import { existsSync } from "node:fs";
import { serveStatic } from "@hono/node-server/serve-static";
import { zValidator } from "@hono/zod-validator";
import {
  CAMPUSES,
  DraftPatchSchema,
  DraftStatusSchema,
  ListingQuerySchema,
  ListingStatePatchSchema,
  ProfileSchema,
  ProfileWriteSchema,
  SettingsPatchSchema,
  TemplateWriteSchema,
  type Draft,
  type ListingView,
  type Profile,
  type Settings,
  type SourceStatus,
  type Stats,
} from "@housing/shared";
import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { HTTPException } from "hono/http-exception";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import type { Repos, StoredSource } from "../db/repo/index.ts";
import { newId } from "../ids.ts";
import type { Logger } from "../log.ts";
import { previewProfile } from "../match/reevaluate.ts";
import type { Notifier } from "../notify/notifier.ts";
import type { DraftService } from "../outreach/drafts.ts";
import type { Mailer } from "../outreach/mailer.ts";
import type { Pipeline } from "../pipeline/run.ts";
import type { EventBus } from "./events.ts";

const VERSION = "0.1.0";
const SSE_HEARTBEAT_MS = 25_000;
const NOTIFICATION_LIMIT = 200;
/** A source switched off for longer than this rebaselines instead of pushing its backlog. */
const REBASELINE_AFTER_MS = 24 * 60 * 60 * 1000;

export interface AppDeps {
  repos: Repos;
  bus: EventBus;
  pipeline: Pipeline;
  drafts: DraftService;
  mailer: Mailer;
  notifier: Notifier;
  log: Logger;
  runSourceNow(sourceId: string): Promise<void>;
  dashboardPassword: string | null;
  llmConfigured: boolean;
  ntfyCommandTopicConfigured: boolean;
  webDistDir: string | null;
}

function toSettings(deps: AppDeps): Settings | null {
  const stored = deps.repos.config.getSettings();
  if (stored === null) return null;
  return {
    ...stored,
    smtpConfigured: deps.mailer.configured,
    llmConfigured: deps.llmConfigured,
    ntfyCommandTopicConfigured: deps.ntfyCommandTopicConfigured,
  };
}

function toSourceStatus(source: StoredSource): SourceStatus {
  return {
    id: source.id,
    name: source.name,
    kind: source.kind,
    homepage: source.homepage,
    enabled: source.enabled,
    intervalSec: source.intervalSec,
    needsSetup: source.needsSetup,
    setupHint: source.setupHint,
    config: source.config,
    lastRunAt: source.lastRunAt,
    lastSuccessAt: source.lastSuccessAt,
    lastError: source.lastError,
    consecutiveFailures: source.consecutiveFailures,
    lastRunCount: source.lastRunCount,
    totalListings: source.totalListings,
  };
}

function toViews(repos: Repos, listingIds: string[]): ListingView[] {
  const listings = repos.listings.getMany(listingIds);
  const byId = new Map(listings.map((l) => [l.id, l]));
  const states = repos.listings.getStates(listingIds);
  const matches = repos.profiles.matchesFor(listingIds);
  const draftIds = repos.outreach.draftIdsFor(listingIds);

  return listingIds
    .map((id) => {
      const listing = byId.get(id);
      if (listing === undefined) return null;
      return {
        listing,
        state: states.get(id) ?? { stage: "new" as const, starred: false, hidden: false, notes: "" },
        matches: (matches.get(id) ?? []).map(({ notifiedAt: _notifiedAt, ...match }) => match),
        draftIds: draftIds.get(id) ?? [],
      };
    })
    .filter((view): view is ListingView => view !== null);
}

export function createApp(deps: AppDeps): Hono {
  const { repos, bus, log } = deps;
  const app = new Hono();

  app.onError((error, c) => {
    // Auth challenges and other deliberate HTTP results carry their own response.
    if (error instanceof HTTPException) return error.getResponse();
    log.warn("request failed", { path: c.req.path, error: String(error) });
    return c.json({ error: error.message }, 500);
  });

  if (deps.dashboardPassword !== null) {
    const password = deps.dashboardPassword;
    // Any username, since a self-hosted instance has exactly one user.
    app.use("*", basicAuth({ username: "housing", password, verifyUser: (_user, given) => given === password }));
  }

  const api = new Hono();

  api.get("/health", (c) => c.json({ ok: true, version: VERSION }));

  api.get("/stats", (c) => {
    const stats: Stats = {
      activeListings: repos.listings.countActive(),
      matchedListings: repos.profiles.countMatchedListings(),
      newLast24h: repos.listings.countNewSince(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      stagedDrafts: repos.outreach.countStaged(),
      unreadNotifications: repos.notify.countUnread(),
      sourcesDown: repos.config.countSourcesDown(5),
      byStage: repos.listings.countByStage(),
    };
    return c.json(stats);
  });

  api.get("/campuses", (c) => c.json(CAMPUSES));

  api.get("/settings", (c) => {
    const settings = toSettings(deps);
    if (settings === null) return c.json({ error: "settings are not seeded yet" }, 503);
    return c.json(settings);
  });

  api.patch("/settings", zValidator("json", SettingsPatchSchema), (c) => {
    const stored = repos.config.getSettings();
    if (stored === null) return c.json({ error: "settings are not seeded yet" }, 503);
    repos.config.putSettings({ ...stored, ...c.req.valid("json") }, new Date().toISOString());
    return c.json(toSettings(deps));
  });

  api.get("/profiles", (c) => c.json(repos.profiles.list()));

  api.post("/profiles", zValidator("json", ProfileWriteSchema), async (c) => {
    const now = new Date().toISOString();
    const input = c.req.valid("json");
    const profile: Profile = ProfileSchema.parse({ ...input, id: newId("prf"), createdAt: now, updatedAt: now });
    repos.profiles.insert(profile);
    // A new profile inherits the stored inventory as a baseline instead of pushing all of it.
    await deps.pipeline.evaluateAll(profile, "announce");
    return c.json(profile, 201);
  });

  api.put("/profiles/:id", zValidator("json", ProfileWriteSchema), async (c) => {
    const existing = repos.profiles.get(c.req.param("id"));
    if (existing === null) return c.json({ error: "profile not found" }, 404);
    const updated: Profile = ProfileSchema.parse({
      ...existing,
      ...c.req.valid("json"),
      updatedAt: new Date().toISOString(),
    });
    repos.profiles.update(updated);
    // An edit adopts whatever newly matches without a push, because the owner is already looking.
    await deps.pipeline.evaluateAll(updated, "silent");
    return c.json(updated);
  });

  api.delete("/profiles/:id", (c) => {
    repos.profiles.remove(c.req.param("id"));
    bus.publish({ type: "profiles.changed" });
    return c.body(null, 204);
  });

  api.post("/profiles/preview", zValidator("json", ProfileWriteSchema), (c) => {
    const now = new Date().toISOString();
    const profile = ProfileSchema.parse({
      ...c.req.valid("json"),
      id: "preview",
      createdAt: now,
      updatedAt: now,
    });
    return c.json(previewProfile(profile, repos));
  });

  api.get("/listings", zValidator("query", ListingQuerySchema), (c) => {
    const { rows, total } = repos.listings.query(c.req.valid("query"));
    return c.json({ items: toViews(repos, rows.map((r) => r.id)), total });
  });

  api.get("/listings/:id", (c) => {
    const view = toViews(repos, [c.req.param("id")])[0];
    if (view === undefined) return c.json({ error: "listing not found" }, 404);
    return c.json(view);
  });

  api.patch("/listings/:id/state", zValidator("json", ListingStatePatchSchema), (c) => {
    const id = c.req.param("id");
    if (repos.listings.get(id) === null) return c.json({ error: "listing not found" }, 404);
    repos.listings.setState(id, { ...repos.listings.getState(id), ...c.req.valid("json") }, new Date().toISOString());
    bus.publish({ type: "listing.state", listingId: id });
    return c.json(toViews(repos, [id])[0]);
  });

  api.get("/drafts", zValidator("query", z.object({ status: DraftStatusSchema.optional() })), (c) =>
    c.json(repos.outreach.listDrafts(c.req.valid("query").status)),
  );

  api.get("/drafts/:id", (c) => {
    const draft = repos.outreach.getDraft(c.req.param("id"));
    if (draft === null) return c.json({ error: "draft not found" }, 404);
    return c.json(draft);
  });

  api.post("/listings/:id/drafts", zValidator("json", z.object({ profileId: z.string() })), async (c) => {
    const listing = repos.listings.get(c.req.param("id"));
    if (listing === null) return c.json({ error: "listing not found" }, 404);
    const profile = repos.profiles.get(c.req.valid("json").profileId);
    if (profile === null) return c.json({ error: "profile not found" }, 404);

    const draft = await deps.drafts.stage(listing, profile);
    if (draft === null) {
      return c.json({ error: "this listing has no contact details and no template is configured" }, 422);
    }
    return c.json(draft, 201);
  });

  api.patch("/drafts/:id", zValidator("json", DraftPatchSchema), (c) => {
    const draft = deps.drafts.patch(c.req.param("id"), c.req.valid("json"));
    if (draft === null) return c.json({ error: "draft not found" }, 404);
    return c.json(draft);
  });

  api.post("/drafts/:id/send", async (c) => {
    try {
      return c.json(await deps.drafts.send(c.req.param("id")));
    } catch (error) {
      return c.json({ error: String(error instanceof Error ? error.message : error) }, 422);
    }
  });

  api.post("/drafts/:id/mark-sent", async (c) => {
    try {
      return c.json(await deps.drafts.markSent(c.req.param("id")));
    } catch (error) {
      return c.json({ error: String(error instanceof Error ? error.message : error) }, 422);
    }
  });

  api.delete("/drafts/:id", (c) => {
    const draft: Draft | null = deps.drafts.discard(c.req.param("id"));
    if (draft === null) return c.json({ error: "draft not found" }, 404);
    return c.body(null, 204);
  });

  api.get("/templates", (c) => c.json(repos.outreach.listTemplates()));

  api.post("/templates", zValidator("json", TemplateWriteSchema), (c) => {
    const template = { id: newId("tpl"), ...c.req.valid("json") };
    repos.outreach.insertTemplate(template);
    return c.json(template, 201);
  });

  api.put("/templates/:id", zValidator("json", TemplateWriteSchema), (c) => {
    const id = c.req.param("id");
    if (repos.outreach.getTemplate(id) === null) return c.json({ error: "template not found" }, 404);
    const template = { id, ...c.req.valid("json") };
    repos.outreach.updateTemplate(template);
    return c.json(template);
  });

  api.delete("/templates/:id", (c) => {
    repos.outreach.removeTemplate(c.req.param("id"));
    return c.body(null, 204);
  });

  api.get(
    "/notifications",
    zValidator("query", z.object({ unread: z.string().optional() })),
    (c) => c.json(repos.notify.list(c.req.valid("query").unread === "true", NOTIFICATION_LIMIT)),
  );

  api.post("/notifications/read", zValidator("json", z.object({ ids: z.array(z.string()).optional() })), (c) => {
    repos.notify.markRead(c.req.valid("json").ids ?? null, new Date().toISOString());
    return c.body(null, 204);
  });

  api.get("/sources", (c) => c.json(repos.config.listSources().map(toSourceStatus)));

  api.patch(
    "/sources/:id",
    zValidator(
      "json",
      z.object({
        enabled: z.boolean().optional(),
        intervalSec: z.number().int().min(30).optional(),
        config: z.record(z.string(), z.unknown()).optional(),
      }),
    ),
    (c) => {
      const id = c.req.param("id");
      const source = repos.config.getSource(id);
      if (source === null) return c.json({ error: "source not found" }, 404);

      const patch = c.req.valid("json");
      const now = new Date();
      const extra: { disabledAt?: string | null; baselineAt?: string | null } = {};
      if (patch.enabled === false && source.enabled) extra.disabledAt = now.toISOString();
      if (patch.enabled === true && !source.enabled) {
        const off = source.disabledAt === null ? 0 : now.getTime() - Date.parse(source.disabledAt);
        // A long pause means the site moved on, so the next run is a baseline rather than a backlog.
        if (off > REBASELINE_AFTER_MS) extra.baselineAt = null;
        extra.disabledAt = null;
      }

      repos.config.updateSource(id, { ...patch, ...extra });
      bus.publish({ type: "source.status", sourceId: id });
      const updated = repos.config.getSource(id);
      if (updated === null) return c.json({ error: "source not found" }, 404);
      return c.json(toSourceStatus(updated));
    },
  );

  api.post("/sources/:id/run", async (c) => {
    const id = c.req.param("id");
    if (repos.config.getSource(id) === null) return c.json({ error: "source not found" }, 404);
    await deps.runSourceNow(id);
    const updated = repos.config.getSource(id);
    if (updated === null) return c.json({ error: "source not found" }, 404);
    return c.json(toSourceStatus(updated));
  });

  api.post("/test/ntfy", zValidator("json", z.object({ profileId: z.string() })), async (c) => {
    const profile = repos.profiles.get(c.req.valid("json").profileId);
    if (profile === null) return c.json({ error: "profile not found" }, 404);
    try {
      await deps.notifier.deliver({
        kind: "digest",
        profile,
        listingId: null,
        title: "Test push",
        body: `Notifications for ${profile.name} are working.`,
        priority: 3,
        tags: ["white_check_mark"],
        alwaysSend: true,
      });
      return c.json({ ok: true });
    } catch (error) {
      return c.json({ ok: false, error: String(error) });
    }
  });

  api.post("/test/smtp", async (c) => {
    try {
      await deps.mailer.verify();
      return c.json({ ok: true });
    } catch (error) {
      return c.json({ ok: false, error: String(error instanceof Error ? error.message : error) });
    }
  });

  api.get("/events", (c) =>
    streamSSE(c, async (stream) => {
      const queue: string[] = [];
      let wake: (() => void) | null = null;

      const unsubscribe = bus.subscribe((event) => {
        queue.push(JSON.stringify(event));
        wake?.();
      });
      stream.onAbort(() => {
        unsubscribe();
        wake?.();
      });

      await stream.writeSSE({ event: "ready", data: JSON.stringify({ version: VERSION }) });

      while (!stream.aborted) {
        const next = queue.shift();
        if (next !== undefined) {
          await stream.writeSSE({ event: "message", data: next });
          continue;
        }
        // Heartbeat keeps proxies and sleeping laptops from silently dropping the stream.
        const timer = new Promise<void>((resolve) => {
          const handle = setTimeout(resolve, SSE_HEARTBEAT_MS);
          wake = () => {
            clearTimeout(handle);
            resolve();
          };
        });
        await timer;
        wake = null;
        if (!stream.aborted && queue.length === 0) {
          await stream.writeSSE({ event: "heartbeat", data: String(Date.now()) });
        }
      }
      unsubscribe();
    }),
  );

  app.route("/api", api);

  const dist = deps.webDistDir;
  if (dist !== null && existsSync(dist)) {
    app.use("/assets/*", serveStatic({ root: dist }));
    app.use("/*", serveStatic({ root: dist }));
    // Single page app: any unknown path that is not an API call renders the dashboard shell.
    app.get("*", serveStatic({ root: dist, path: "index.html" }));
  }

  app.notFound((c) => c.json({ error: "not found" }, 404));

  return app;
}
