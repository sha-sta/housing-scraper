import type { z } from "zod";

/**
 * Reading a JSON column is a boundary: the file on disk can be edited by hand or written by an
 * older build. A mismatch fails loudly here rather than leaking a wrong shape into the API.
 */
export function parseColumn<T>(schema: z.ZodType<T>, raw: string, column: string): T {
  const result = schema.safeParse(JSON.parse(raw));
  if (!result.success) {
    throw new Error(`column ${column} does not match its schema: ${result.error.message}`);
  }
  return result.data;
}

export function toColumn(value: unknown): string {
  return JSON.stringify(value);
}
