/** Every shortcut, in the order the sheet lists them. */
export const SHORTCUTS: { keys: string; what: string }[] = [
  { keys: "j", what: "Move down the feed" },
  { keys: "k", what: "Move up the feed" },
  { keys: "Enter or o", what: "Open the highlighted listing" },
  { keys: "s", what: "Star it" },
  { keys: "h", what: "Hide it" },
  { keys: "Escape", what: "Close the listing" },
  { keys: "?", what: "Show this sheet" },
];

/** True when the keypress belongs to whatever the reader is typing in. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  // isContentEditable is the browser's own answer, and it inherits. jsdom has only the
  // attribute, so the tests need both.
  if (target.isContentEditable) return true;
  const editable = target.getAttribute("contenteditable");
  return editable !== null && editable !== "false";
}

/** Where j and k land. The first press of either lands on the first row. */
export function nextHighlight(
  current: number | null,
  delta: number,
  count: number,
): number | null {
  if (count <= 0) return null;
  if (current === null) return 0;
  return Math.max(0, Math.min(count - 1, current + delta));
}
