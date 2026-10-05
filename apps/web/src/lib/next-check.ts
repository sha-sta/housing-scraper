import type { SourceStatus } from "@housing/shared";

export type NextCheck =
  | { kind: "paused" }
  | { kind: "setup" }
  | { kind: "running" }
  | { kind: "due" }
  | { kind: "countdown"; seconds: number };

/**
 * What the Next check column has to say about one source. A disabled source is paused
 * whatever else is wrong with it, and a source with no planned time is mid-run.
 */
export function nextCheck(
  source: Pick<SourceStatus, "enabled" | "needsSetup" | "nextRunAt">,
  now: number,
): NextCheck {
  if (!source.enabled) return { kind: "paused" };
  if (source.needsSetup) return { kind: "setup" };
  if (source.nextRunAt === null) return { kind: "running" };
  const at = Date.parse(source.nextRunAt);
  if (!Number.isFinite(at)) return { kind: "running" };
  const seconds = Math.floor((at - now) / 1000);
  return seconds <= 0 ? { kind: "due" } : { kind: "countdown", seconds };
}

/** "2m 10s", and "1h 4m" once the wait is long enough that seconds stop mattering. */
export function formatCountdown(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  if (total >= 3600) return `${Math.floor(total / 3600)}h ${Math.floor((total % 3600) / 60)}m`;
  if (total >= 60) return `${Math.floor(total / 60)}m ${total % 60}s`;
  return `${total}s`;
}

export function nextCheckText(state: NextCheck): string {
  switch (state.kind) {
    case "paused":
      return "Paused";
    case "setup":
      return "Needs setup";
    case "running":
    case "due":
      return "Running";
    case "countdown":
      return `in ${formatCountdown(state.seconds)}`;
  }
}
