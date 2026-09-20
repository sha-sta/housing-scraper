import type { z } from "zod";
import { SourceLayoutError } from "./types.ts";

/**
 * Narrows a site response from unknown to a typed value. A mismatch means the site changed
 * its layout, so the error names the failing path and the scheduler can report it.
 */
export function decode<T>(schema: z.ZodType<T>, value: unknown, where: string): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const path = issue && issue.path.length > 0 ? issue.path.map(String).join(".") : "(root)";
  throw new SourceLayoutError(`${where}: ${path} ${issue?.message ?? "did not match"}`);
}

/** Throws SourceLayoutError when a required piece of a page is missing. */
export function found<T>(value: T | null | undefined, where: string, what: string): T {
  if (value === null || value === undefined) {
    throw new SourceLayoutError(`${where}: ${what} not found`);
  }
  return value;
}
