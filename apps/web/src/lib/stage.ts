import { STAGES, type Stage } from "@housing/shared";

export const STAGE_ORDER: readonly Stage[] = STAGES;

const LABELS: Record<Stage, string> = {
  new: "New",
  interested: "Interested",
  contacted: "Contacted",
  replied: "Replied",
  touring: "Touring",
  applied: "Applied",
  signed: "Signed",
  passed: "Passed",
};

export function stageLabel(stage: Stage): string {
  return LABELS[stage];
}

/** Each stage gets a colour variable defined in styles.css, so dark mode is handled there. */
export function stageColor(stage: Stage): string {
  return `var(--stage-${stage})`;
}

const HINTS: Record<Stage, string> = {
  new: "Nothing here yet. New matches land in this column first.",
  interested: "Star a listing on the feed and move it here once it is worth an email.",
  contacted: "Sending a draft moves the listing here on its own.",
  replied: "Move a listing here when the landlord writes back.",
  touring: "Move a listing here once a showing is booked.",
  applied: "Move a listing here once your application is in.",
  signed: "The finish line. Nothing here yet.",
  passed: "Listings you ruled out.",
};

export function stageHint(stage: Stage): string {
  return HINTS[stage];
}
