import { randomBytes } from "node:crypto";

/** Sortable by creation time, which keeps "newest first" queries cheap without a second index. */
export function newId(prefix: string): string {
  const time = Date.now().toString(36).padStart(9, "0");
  return `${prefix}_${time}${randomBytes(6).toString("hex")}`;
}
