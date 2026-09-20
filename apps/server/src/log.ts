import { pino } from "pino";
import type { Logger } from "@housing/sources";

export type { Logger };

export function createLogger(level: string): Logger {
  const base = pino({ level });
  return {
    debug: (msg, data) => base.debug(data ?? {}, msg),
    info: (msg, data) => base.info(data ?? {}, msg),
    warn: (msg, data) => base.warn(data ?? {}, msg),
    error: (msg, data) => base.error(data ?? {}, msg),
  };
}

/** Swallows everything. Used by tests and by the pure helpers that take a logger for symmetry. */
export function silentLogger(): Logger {
  return { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
}
