import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

export interface Env {
  repoRoot: string;
  port: number;
  dataDir: string;
  appSecret: string;
  ntfyCommandTopic: string;
  ntfyToken: string | null;
  ntfyDailyBudget: number;
  smtp: SmtpConfig | null;
  anthropicApiKey: string | null;
  anthropicModel: string;
  dashboardPassword: string | null;
  valhallaUrl: string | null;
  demo: boolean;
  logLevel: string;
}

const DEFAULT_PORT = 4747;
const DEFAULT_NTFY_DAILY_BUDGET = 200;
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";

function findRepoRoot(start: string): string {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

/** Reads a variable and treats blank as unset, since .env.example ships every key with an empty value. */
function read(name: string): string | null {
  const raw = process.env[name];
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

function readNumber(name: string, fallback: number): number {
  const raw = read(name);
  if (raw === null) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** 32 URL-safe characters. Long enough that a command topic cannot be guessed. */
function generateSecret(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Writes a generated value back to .env so the next boot reuses it. An existing key with a blank
 * value is filled in place, because a duplicate key later in the file would shadow confusingly.
 */
function persist(envPath: string, name: string, value: string): void {
  const line = `${name}=${value}`;
  let contents = "";
  if (existsSync(envPath)) {
    contents = readFileSync(envPath, "utf8");
  }
  const blank = new RegExp(`^${name}=[ \\t]*$`, "m");
  if (blank.test(contents)) {
    writeFileSync(envPath, contents.replace(blank, line), "utf8");
    return;
  }
  const separator = contents === "" || contents.endsWith("\n") ? "" : "\n";
  writeFileSync(envPath, `${contents}${separator}${line}\n`, "utf8");
}

function loadSmtp(): SmtpConfig | null {
  const host = read("SMTP_HOST");
  const user = read("SMTP_USER");
  const pass = read("SMTP_PASS");
  const from = read("SMTP_FROM") ?? user;
  if (host === null || user === null || pass === null || from === null) return null;
  return { host, port: readNumber("SMTP_PORT", 465), user, pass, from };
}

/**
 * Loads .env from the repo root, generating the two secrets on first run. Values already present
 * in the real environment win over the file, so `DEMO=1 pnpm start` overrides what .env says.
 */
export function loadEnv(): Env {
  const repoRoot = findRepoRoot(import.meta.dirname);
  const envPath = join(repoRoot, ".env");
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }

  for (const name of ["APP_SECRET", "NTFY_COMMAND_TOPIC"]) {
    if (read(name) !== null) continue;
    const value = generateSecret();
    process.env[name] = value;
    persist(envPath, name, value);
  }

  const dataDirRaw = read("DATA_DIR") ?? "./data";
  const dataDir = isAbsolute(dataDirRaw) ? dataDirRaw : resolve(repoRoot, dataDirRaw);

  return {
    repoRoot,
    port: readNumber("PORT", DEFAULT_PORT),
    dataDir,
    appSecret: read("APP_SECRET") ?? generateSecret(),
    ntfyCommandTopic: read("NTFY_COMMAND_TOPIC") ?? generateSecret(),
    ntfyToken: read("NTFY_TOKEN"),
    ntfyDailyBudget: readNumber("NTFY_DAILY_BUDGET", DEFAULT_NTFY_DAILY_BUDGET),
    smtp: loadSmtp(),
    anthropicApiKey: read("ANTHROPIC_API_KEY"),
    anthropicModel: read("ANTHROPIC_MODEL") ?? DEFAULT_ANTHROPIC_MODEL,
    dashboardPassword: read("DASHBOARD_PASSWORD"),
    valhallaUrl: read("VALHALLA_URL"),
    demo: read("DEMO") === "1",
    logLevel: read("LOG_LEVEL") ?? "info",
  };
}
