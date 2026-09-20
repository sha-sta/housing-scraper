import type { SourceAdapter } from "@housing/sources";
import type { Repos } from "./db/repo/index.ts";
import { newId } from "./ids.ts";

const GROUP_INTRO_SUBJECT = "Tour request for {{listing.address}} from a group of {{group.size}} students";

const GROUP_INTRO_BODY = `Hello {{contact.name}},

My name is {{me.fullName}} and I am a student at {{me.school}}. I am writing about your listing at {{listing.address}}, listed at {{listing.priceText}}.

{{me.blurb}}

There are {{group.size}} of us and we are hoping to move in around {{profile.moveIn}}. We are all full time students, we can provide guarantors, and we can send references from our current landlord.

Could we come see the unit this week or next? I would also like to know what the application needs so we can have everything ready when we visit.

Thank you for your time,
{{me.fullName}}
{{me.email}}
{{me.phone}}`;

const SHORT_SUBJECT = "Is {{listing.address}} still available?";

const SHORT_BODY = `Hi {{contact.name}},

I am {{me.fullName}}, a student at {{me.school}}. Is {{listing.address}} still available?

There are {{group.size}} of us and we are looking to move in around {{profile.moveIn}}. Could we set up a tour, and what does the application require?

Thank you,
{{me.fullName}}
{{me.email}}
{{me.phone}}`;

export interface SeedOptions {
  repos: Repos;
  adapters: SourceAdapter[];
  defaultDashboardUrl: string;
}

/** Runs on every boot. Each piece is added only when it is missing, so a restart changes nothing. */
export function seed(options: SeedOptions): void {
  const { repos, adapters } = options;
  const now = new Date().toISOString();

  if (repos.config.getSettings() === null) {
    repos.config.putSettings(
      {
        setupComplete: false,
        campusId: "homewood",
        identity: { fullName: "", email: "", phone: "", school: "", blurb: "" },
        composeVia: "mailto",
        ntfyServer: "https://ntfy.sh",
        dashboardUrl: options.defaultDashboardUrl,
      },
      now,
    );
  }

  if (repos.outreach.countTemplates() === 0) {
    repos.outreach.insertTemplate({
      id: newId("tpl"),
      name: "Group intro",
      subject: GROUP_INTRO_SUBJECT,
      body: GROUP_INTRO_BODY,
    });
    repos.outreach.insertTemplate({
      id: newId("tpl"),
      name: "Short and direct",
      subject: SHORT_SUBJECT,
      body: SHORT_BODY,
    });
  }

  for (const adapter of adapters) {
    if (repos.config.getSource(adapter.id) !== null) continue;
    repos.config.insertSource({
      id: adapter.id,
      name: adapter.name,
      kind: adapter.kind,
      homepage: adapter.homepage,
      enabled: adapter.defaultEnabled,
      intervalSec: adapter.defaultIntervalSec,
      config: adapter.defaultConfig,
      needsSetup: false,
      setupHint: null,
      lastRunAt: null,
      lastSuccessAt: null,
      lastError: null,
      consecutiveFailures: 0,
      lastRunCount: 0,
      totalListings: 0,
      baselineAt: null,
      disabledAt: adapter.defaultEnabled ? null : now,
      backoffUntil: null,
      downNotifiedAt: null,
    });
  }
}
