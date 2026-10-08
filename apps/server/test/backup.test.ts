import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { backupDir, createBackups, localDay, msUntilNextRun, type Backups } from "../src/backup.ts";
import type { Logger } from "../src/log.ts";
import { silentLogger } from "../src/log.ts";
import { makeListing, openTempDb, type TempDb } from "./helpers.ts";

interface Line {
  level: "info" | "warn";
  msg: string;
  data: Record<string, unknown> | undefined;
}

let db: TempDb;
let dataDir: string;
let lines: Line[];
let clock: Date;

function logger(): Logger {
  return {
    ...silentLogger(),
    info: (msg, data) => lines.push({ level: "info", msg, data }),
    warn: (msg, data) => lines.push({ level: "warn", msg, data }),
  };
}

function makeBackups(overrides: { demo?: boolean; dataDir?: string } = {}): Backups {
  return createBackups({
    db: db.handle.db,
    dataDir: overrides.dataDir ?? dataDir,
    log: logger(),
    demo: overrides.demo ?? false,
    now: () => clock,
  });
}

function files(): string[] {
  const dir = backupDir(dataDir);
  return existsSync(dir) ? readdirSync(dir).sort() : [];
}

beforeEach(() => {
  db = openTempDb();
  dataDir = mkdtempSync(join(tmpdir(), "housing-backup-"));
  lines = [];
  clock = new Date(2026, 9, 8, 3, 30, 0);
  db.repos.listings.insert(makeListing({ id: "lst_one" }));
  db.repos.listings.insert(makeListing({ id: "lst_two", address: "3212 Guilford Ave, Baltimore, MD 21218" }));
});

afterEach(() => {
  db.close();
  rmSync(dataDir, { recursive: true, force: true });
});

describe("nightly backup", () => {
  it("writes a readable copy of the database and reports its size", () => {
    const file = makeBackups().runOnce();
    expect(file).toBe(join(backupDir(dataDir), "housing-2026-10-08.db"));
    expect(files()).toEqual(["housing-2026-10-08.db"]);

    const copy = new Database(file!, { readonly: true });
    const counted = copy.prepare("select count(*) as n from listings").get() as { n: number };
    copy.close();
    expect(counted.n).toBe(db.repos.listings.active().length);
    expect(counted.n).toBe(2);

    const written = lines.filter((line) => line.msg === "wrote a database backup");
    expect(written).toHaveLength(1);
    expect(written[0]?.data?.file).toBe(file);
    expect(written[0]?.data?.bytes as number).toBeGreaterThan(0);
  });

  it("keeps seven days, so the eighth backup drops the oldest", () => {
    const backups = makeBackups();
    for (let day = 1; day <= 8; day += 1) {
      clock = new Date(2026, 9, day, 3, 30, 0);
      expect(backups.runOnce()).not.toBeNull();
    }

    expect(files()).toEqual([
      "housing-2026-10-02.db",
      "housing-2026-10-03.db",
      "housing-2026-10-04.db",
      "housing-2026-10-05.db",
      "housing-2026-10-06.db",
      "housing-2026-10-07.db",
      "housing-2026-10-08.db",
    ]);
    expect(files()).toHaveLength(7);
  });

  it("replaces its own file when it runs twice on one day", () => {
    const backups = makeBackups();
    expect(backups.runOnce()).not.toBeNull();
    db.repos.listings.insert(makeListing({ id: "lst_three", address: "3214 Guilford Ave" }));
    const file = backups.runOnce();

    expect(files()).toEqual(["housing-2026-10-08.db"]);
    const copy = new Database(file!, { readonly: true });
    const counted = copy.prepare("select count(*) as n from listings").get() as { n: number };
    copy.close();
    expect(counted.n).toBe(3);
  });

  it("backs up on boot only when nothing was written in the last day", () => {
    const backups = makeBackups();
    backups.start();
    expect(files()).toEqual(["housing-2026-10-08.db"]);
    backups.stop();

    const second = makeBackups();
    second.start();
    second.stop();
    expect(lines.filter((line) => line.msg === "wrote a database backup")).toHaveLength(1);
  });

  it("writes nothing in demo mode", () => {
    const backups = makeBackups({ demo: true });
    backups.start();
    backups.stop();
    expect(existsSync(backupDir(dataDir))).toBe(false);
    expect(lines).toEqual([]);
  });

  it("warns and carries on when the backup cannot be written", () => {
    const blocked = join(dataDir, "not-a-directory");
    writeFileSync(blocked, "", "utf8");

    const backups = makeBackups({ dataDir: blocked });
    expect(backups.runOnce()).toBeNull();
    const warned = lines.filter((line) => line.level === "warn");
    expect(warned).toHaveLength(1);
    expect(warned[0]?.msg).toBe("database backup failed");
  });
});

describe("backup schedule", () => {
  it("waits for 03:30 today, or tomorrow once it has passed", () => {
    expect(msUntilNextRun(new Date(2026, 9, 8, 1, 0, 0))).toBe(2.5 * 60 * 60 * 1000);
    expect(msUntilNextRun(new Date(2026, 9, 8, 3, 30, 0))).toBe(24 * 60 * 60 * 1000);
    expect(msUntilNextRun(new Date(2026, 9, 8, 4, 0, 0))).toBe(23.5 * 60 * 60 * 1000);
  });

  it("names the file after the local day", () => {
    expect(localDay(new Date(2026, 0, 2, 23, 59, 0))).toBe("2026-01-02");
  });
});
