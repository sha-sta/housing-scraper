import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import type { Db } from "./db/client.ts";
import type { Logger } from "./log.ts";

/** Local time of the nightly copy. Late enough that the laptop is idle, early enough to beat a morning. */
const HOUR = 3;
const MINUTE = 30;
/** One week of nightly copies is enough to notice a bad edit and go back before it. */
const KEEP = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const FILE_PATTERN = /^housing-\d{4}-\d{2}-\d{2}\.db$/;

export interface BackupOptions {
  db: Db;
  dataDir: string;
  log: Logger;
  /** DEMO=1 fills the database with synthetic listings, so there is nothing worth keeping. */
  demo: boolean;
  now?: () => Date;
}

export interface Backups {
  /** Writes one copy and prunes the old ones. Returns the file written, or null when it failed. */
  runOnce(): string | null;
  start(): void;
  stop(): void;
}

export function backupDir(dataDir: string): string {
  return join(dataDir, "backups");
}

/** The local calendar day, because the schedule is local time and so is the owner reading the name. */
export function localDay(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function msUntilNextRun(now: Date): number {
  const next = new Date(now);
  next.setHours(HOUR, MINUTE, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

export function createBackups(options: BackupOptions): Backups {
  const { db, log } = options;
  const now = options.now ?? ((): Date => new Date());
  const dir = backupDir(options.dataDir);
  let timer: NodeJS.Timeout | null = null;

  function existing(): string[] {
    if (!existsSync(dir)) return [];
    // The names carry an ISO day, so sorting them as text sorts them by age.
    return readdirSync(dir).filter((name) => FILE_PATTERN.test(name)).sort();
  }

  function prune(): string[] {
    const names = existing();
    const stale = names.slice(0, Math.max(0, names.length - KEEP));
    for (const name of stale) rmSync(join(dir, name), { force: true });
    return stale;
  }

  function runOnce(): string | null {
    const file = join(dir, `housing-${localDay(now())}.db`);
    try {
      mkdirSync(dir, { recursive: true });
      // VACUUM INTO refuses an existing target, so the copy lands beside it and then takes its place.
      const partial = `${file}.partial`;
      rmSync(partial, { force: true });
      db.run(sql`VACUUM INTO ${partial}`);
      renameSync(partial, file);

      const pruned = prune();
      log.info("wrote a database backup", { file, bytes: statSync(file).size, pruned: pruned.length });
      return file;
    } catch (error) {
      // The pipeline does not depend on this, so a failure is news rather than a reason to stop.
      log.warn("database backup failed", { file, error: String(error) });
      return null;
    }
  }

  function schedule(): void {
    timer = setTimeout(() => {
      runOnce();
      schedule();
    }, msUntilNextRun(now()));
    timer.unref();
  }

  function writtenWithinADay(): boolean {
    const cutoff = now().getTime() - DAY_MS;
    return existing().some((name) => statSync(join(dir, name)).mtimeMs >= cutoff);
  }

  return {
    runOnce,

    start() {
      if (options.demo) {
        log.debug("demo mode, so the database is not backed up");
        return;
      }
      // A machine that is asleep every night at 03:30 would otherwise never get a copy.
      if (!writtenWithinADay()) runOnce();
      schedule();
    },

    stop() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
