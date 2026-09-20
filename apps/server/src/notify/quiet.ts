export interface QuietWindow {
  start: string;
  end: string;
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Minutes since local midnight, or null when the string is not "HH:MM". */
export function parseHhMm(value: string): number | null {
  const match = HHMM.exec(value.trim());
  if (match === null) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * True inside the profile's quiet window, using the server's local time. A window that wraps past
 * midnight (23:00 to 07:00) is two ranges. A window whose ends are equal is empty, not the whole day.
 */
export function isQuiet(now: Date, window: QuietWindow | null): boolean {
  if (window === null) return false;
  const start = parseHhMm(window.start);
  const end = parseHhMm(window.end);
  if (start === null || end === null || start === end) return false;
  const current = minutesOfDay(now);
  return start < end ? current >= start && current < end : current >= start || current < end;
}
