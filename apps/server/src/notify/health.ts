import type { ProfileRepo, StoredSource } from "../db/repo/index.ts";
import type { Notifier } from "./notifier.ts";

/** Consecutive failures before the owner hears about it. */
export const DOWN_THRESHOLD = 5;

export interface HealthNotifier {
  sourceDown(source: StoredSource): Promise<void>;
  sourceRecovered(source: StoredSource): Promise<void>;
}

export function createHealthNotifier(profiles: ProfileRepo, notifier: Notifier): HealthNotifier {
  async function announce(kind: "sourceDown" | "sourceRecovered", title: string, body: string): Promise<void> {
    for (const profile of profiles.enabled()) {
      await notifier.deliver({
        kind,
        profile,
        listingId: null,
        title,
        body,
        priority: 3,
        tags: [kind === "sourceDown" ? "warning" : "white_check_mark"],
        // Health tells the owner the watcher is broken, so it never waits in a digest.
        alwaysSend: true,
      });
    }
  }

  return {
    sourceDown: (source) =>
      announce(
        "sourceDown",
        `${source.name} is not answering`,
        `${source.consecutiveFailures} runs in a row failed. Last error: ${source.lastError ?? "unknown"}`,
      ),
    sourceRecovered: (source) =>
      announce("sourceRecovered", `${source.name} is back`, "The source answered again and is being polled."),
  };
}
