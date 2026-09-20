import { join } from "node:path";
import { serve } from "@hono/node-server";
import type { SourceAdapter } from "@housing/sources";
import { createApp } from "./api/app.ts";
import { createEventBus } from "./api/events.ts";
import { openDb } from "./db/client.ts";
import { createRepos } from "./db/repo/index.ts";
import { demoAdapters } from "./demo/source.ts";
import { loadEnv } from "./env.ts";
import { createLogger } from "./log.ts";
import { createRouter } from "./match/routing.ts";
import { createCommandListener } from "./notify/commands.ts";
import { createHealthNotifier } from "./notify/health.ts";
import { createNotifier } from "./notify/notifier.ts";
import { createNtfyClient } from "./notify/ntfy.ts";
import type { PushContext } from "./notify/push.ts";
import { createDraftService } from "./outreach/drafts.ts";
import { createPersonalizer } from "./outreach/llm.ts";
import { createMailer } from "./outreach/mailer.ts";
import { createGeocoder } from "./pipeline/geocode.ts";
import { createPipeline } from "./pipeline/run.ts";
import { repairListings } from "./repair.ts";
import { createScheduler } from "./scheduler.ts";
import { seed } from "./seed.ts";
import { lazyBrowserPool, loadSources, unavailableBrowserPool, unavailableHttpClient } from "./sources.ts";

const DIGEST_SWEEP_MS = 60_000;
const DEFAULT_NTFY_SERVER = "https://ntfy.sh";

async function main(): Promise<void> {
  const env = loadEnv();
  const log = createLogger(env.logLevel);
  const handle = openDb(join(env.dataDir, "housing.db"));
  const repos = createRepos(handle.db);
  const bus = createEventBus();

  const sources = await loadSources(log);
  const adapters: SourceAdapter[] = [...(sources?.adapters ?? []), ...(env.demo ? demoAdapters : [])];
  const http = sources === null ? unavailableHttpClient() : sources.createHttpClient({ log });
  const browser = lazyBrowserPool(() =>
    sources === null
      ? unavailableBrowserPool()
      : sources.createBrowserPool({ log, dataDir: env.dataDir, headless: true }),
  );

  const peerPostedIds = new Set(adapters.filter((a) => a.peerPosted === true).map((a) => a.id));

  seed({ repos, adapters, defaultDashboardUrl: `http://localhost:${env.port}` });

  const ntfyServer = (): string => repos.config.getSettings()?.ntfyServer ?? DEFAULT_NTFY_SERVER;
  const ntfy = createNtfyClient({ server: ntfyServer, token: env.ntfyToken, log });
  const notifier = createNotifier({
    notify: repos.notify,
    config: repos.config,
    ntfy,
    bus,
    log,
    dailyBudget: env.ntfyDailyBudget,
    loadProfile: (id) => repos.profiles.get(id),
  });
  const health = createHealthNotifier(repos.profiles, notifier);

  const mailer = createMailer(env.smtp);
  const personalizer = createPersonalizer({ apiKey: env.anthropicApiKey, model: env.anthropicModel, log });
  const drafts = createDraftService({ repos, bus, mailer, personalizer, notifier, log });

  const pushContext = (): PushContext => {
    const settings = repos.config.getSettings();
    return {
      dashboardUrl: settings?.dashboardUrl ?? `http://localhost:${env.port}`,
      ntfyServer: settings?.ntfyServer ?? DEFAULT_NTFY_SERVER,
      commandTopic: env.ntfyCommandTopic,
      appSecret: env.appSecret,
      smtpConfigured: mailer.configured,
    };
  };

  const pipeline = createPipeline({
    repos,
    bus,
    notifier,
    drafts,
    geocoder: createGeocoder(repos.config, log),
    router: createRouter(repos.config, log, env.valhallaUrl),
    log,
    pushContext,
    peerPosted: (sourceId) => peerPostedIds.has(sourceId),
  });

  // Stored rows predate the price basis and the narrowed scam rules, so they are recomputed once
  // on every boot. Nothing here pushes: matches keep whatever notified_at they already had.
  const repaired = repairListings(repos, (id) => peerPostedIds.has(id));
  if (repaired > 0) log.info("recomputed stored listings", { listings: repaired });

  const scheduler = createScheduler({
    adapters,
    repos,
    pipeline,
    bus,
    health,
    log,
    http,
    browser: () => browser.pool,
  });

  const commands = createCommandListener({
    server: ntfyServer,
    topic: env.ntfyCommandTopic,
    appSecret: env.appSecret,
    token: env.ntfyToken,
    drafts,
    log,
  });

  const app = createApp({
    repos,
    bus,
    pipeline,
    drafts,
    mailer,
    notifier,
    log,
    runSourceNow: (sourceId) => scheduler.runNow(sourceId),
    dashboardPassword: env.dashboardPassword,
    llmConfigured: env.anthropicApiKey !== null,
    ntfyCommandTopicConfigured: env.ntfyCommandTopic !== "",
    webDistDir: join(env.repoRoot, "apps", "web", "dist"),
  });

  const server = serve({ fetch: app.fetch, port: env.port }, (info) => {
    log.info("server listening", { port: info.port, demo: env.demo, sources: adapters.length });
  });

  const digestTimer = setInterval(() => {
    void notifier.releaseDue(new Date()).catch((error: unknown) => {
      log.warn("digest sweep failed", { error: String(error) });
    });
  }, DIGEST_SWEEP_MS);
  digestTimer.unref();

  scheduler.start();
  commands.start();

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info("shutting down", { signal });
    clearInterval(digestTimer);
    commands.stop();
    await scheduler.stop();
    await browser.close();
    server.close();
    handle.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

await main();
