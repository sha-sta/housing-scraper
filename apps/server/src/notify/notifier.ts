import type { Notification, NotificationKind, Profile } from "@housing/shared";
import type { EventBus } from "../api/events.ts";
import type { ConfigRepo, NotifyRepo } from "../db/repo/index.ts";
import { newId } from "../ids.ts";
import type { Logger } from "../log.ts";
import type { NtfyAction, NtfyClient } from "./ntfy.ts";
import { dashboardClick } from "./push.ts";
import { isQuiet } from "./quiet.ts";


/** Once this much of the daily budget is gone, only urgent pushes go out one at a time. */
const BUDGET_SQUEEZE_RATIO = 0.8;
/** How long a budget-held push waits before it joins a digest. */
const BUDGET_DIGEST_MS = 30 * 60 * 1000;
const MAX_DIGEST_LINES = 12;

export interface DeliverInput {
  kind: NotificationKind;
  profile: Profile | null;
  listingId: string | null;
  title: string;
  body: string;
  click?: string | null;
  attach?: string | null;
  priority?: number;
  tags?: string[];
  /** Owner-topic-only actions. The share topic never gets the Send button. */
  actions?: NtfyAction[];
  /** What roommates get instead, normally just the link to the listing. */
  shareActions?: NtfyAction[];
  score?: number | null;
  /** Source health never waits for a digest. */
  alwaysSend?: boolean;
}

export interface Notifier {
  deliver(input: DeliverInput): Promise<Notification>;
  releaseDue(now: Date): Promise<void>;
}

export interface NotifierOptions {
  notify: NotifyRepo;
  config: ConfigRepo;
  ntfy: NtfyClient;
  bus: EventBus;
  log: Logger;
  dailyBudget: number;
  loadProfile(id: string): Profile | null;
}

function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function createNotifier(options: NotifierOptions): Notifier {
  const { notify, ntfy, bus, log } = options;

  async function push(
    topic: string,
    input: DeliverInput,
    actions: NtfyAction[] | undefined,
    day: string,
  ): Promise<boolean> {
    try {
      await ntfy.publish({
        topic,
        title: input.title,
        message: input.body,
        priority: input.priority,
        tags: input.tags,
        click: input.click ?? undefined,
        attach: input.attach ?? undefined,
        actions,
      });
      notify.recordPush(day);
      return true;
    } catch (error) {
      log.warn("ntfy publish failed", { kind: input.kind, error: String(error) });
      return false;
    }
  }

  async function deliver(input: DeliverInput): Promise<Notification> {
    const now = new Date();
    const notification: Notification = {
      id: newId("ntf"),
      kind: input.kind,
      title: input.title,
      body: input.body,
      listingId: input.listingId,
      profileId: input.profile?.id ?? null,
      pushed: false,
      createdAt: now.toISOString(),
      readAt: null,
    };
    notify.insert(notification);

    const profile = input.profile;
    const settings = profile?.preferences.notify;
    const topic = settings?.topic.trim() ?? "";

    if (profile === null || settings === undefined || !settings.enabled || topic === "") {
      bus.publish({ type: "notification.created", notification });
      return notification;
    }

    const held = holdReason(now, profile, input);
    if (held !== null) {
      notify.hold({
        id: newId("hld"),
        profileId: profile.id,
        notificationId: notification.id,
        reason: held,
        title: input.title,
        body: input.body,
        click: input.click ?? null,
        createdAt: now.toISOString(),
      });
      bus.publish({ type: "notification.created", notification });
      return notification;
    }

    const day = utcDay(now);
    const pushed = await push(topic, input, input.actions, day);
    const shareTopic = settings.shareTopic.trim();
    if (shareTopic !== "") {
      // Roommates see the same push without the signed actions, which are for the owner only.
      await push(shareTopic, input, input.shareActions, day);
    }

    if (pushed) {
      notify.setPushed(notification.id, true);
      notification.pushed = true;
    }
    bus.publish({ type: "notification.created", notification });
    return notification;
  }

  function holdReason(now: Date, profile: Profile, input: DeliverInput): "quiet" | "budget" | null {
    if (input.alwaysSend === true) return null;
    if (isQuiet(now, profile.preferences.notify.quietHours)) return "quiet";

    const used = notify.pushesToday(utcDay(now));
    if (used >= options.dailyBudget) return "budget";
    if (used >= options.dailyBudget * BUDGET_SQUEEZE_RATIO) {
      const urgent = input.score !== null && input.score !== undefined
        ? input.score >= profile.preferences.notify.urgentScore
        : false;
      if (!urgent) return "budget";
    }
    return null;
  }

  async function sendDigest(profile: Profile, holds: { id: string; title: string }[], now: Date): Promise<void> {
    const lines = holds.slice(0, MAX_DIGEST_LINES).map((hold) => hold.title);
    const extra = holds.length - lines.length;
    const body = extra > 0 ? `${lines.join("\n")}\n and ${extra} more` : lines.join("\n");

    const settings = options.config.getSettings();
    const click =
      settings === null ? null : (dashboardClick(settings.dashboardUrl, `/?profile=${profile.id}`) ?? null);

    await deliver({
      kind: "digest",
      profile,
      listingId: null,
      title: `${holds.length} held ${holds.length === 1 ? "alert" : "alerts"} for ${profile.name}`,
      body,
      click,
      priority: 3,
      tags: ["mailbox"],
      alwaysSend: true,
    });
    notify.releaseHolds(holds.map((h) => h.id), now.toISOString());
  }

  return {
    deliver,

    /** Called on a timer. Sends one digest per profile whose held pushes are now due. */
    async releaseDue(now) {
      for (const reason of ["quiet", "budget"] as const) {
        for (const profileId of notify.profilesWithHolds(reason)) {
          const profile = options.loadProfile(profileId);
          if (profile === null) continue;
          const holds = notify.pendingHolds(profileId, reason);
          if (holds.length === 0) continue;

          if (reason === "quiet" && isQuiet(now, profile.preferences.notify.quietHours)) continue;
          if (reason === "budget") {
            const oldest = holds[0];
            if (oldest === undefined) continue;
            if (now.getTime() - Date.parse(oldest.createdAt) < BUDGET_DIGEST_MS) continue;
          }
          await sendDigest(profile, holds, now);
        }
      }
    },
  };
}
