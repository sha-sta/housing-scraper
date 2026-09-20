import { execFile } from "node:child_process";
import { networkInterfaces } from "node:os";
import { promisify } from "node:util";
import { z } from "zod";

const run = promisify(execFile);

/** Tailscale hands out addresses from the carrier-grade NAT range reserved in RFC 6598. */
const TAILSCALE_FIRST = ipv4ToNumber("100.64.0.0");
const TAILSCALE_LAST = ipv4ToNumber("100.127.255.255");

const CLI_TIMEOUT_MS = 2_000;
const NAME_CACHE_MS = 5 * 60 * 1000;
const CLI_PATHS = ["tailscale", "/Applications/Tailscale.app/Contents/MacOS/Tailscale"];

const StatusSchema = z.object({ Self: z.object({ DNSName: z.string() }) });

function ipv4ToNumber(address: string): number {
  const parts = address.split(".");
  if (parts.length !== 4) return Number.NaN;
  return parts.reduce((total, part) => total * 256 + Number(part), 0);
}

export function isTailscaleAddress(address: string): boolean {
  const value = ipv4ToNumber(address);
  return Number.isFinite(value) && value >= TAILSCALE_FIRST && value <= TAILSCALE_LAST;
}

/**
 * Anything a phone cannot open. A push that links to localhost links the reader to their own
 * phone, which is the whole reason this check exists.
 */
export function isLocalUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  const bare = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  if (bare === "localhost" || bare.endsWith(".localhost")) return true;
  if (bare === "::1" || bare === "0.0.0.0" || bare === "::") return true;
  return /^127\./.test(bare) && ipv4ToNumber(bare) >= 0;
}

/** Injectable so the tests never depend on whether this machine runs Tailscale. */
export interface NetworkDetector {
  /** The machine's Tailscale IPv4 address, or null when Tailscale is not up. */
  address(): string | null;
  /** The Tailscale DNS name, or null when the CLI is missing or silent. */
  name(): Promise<string | null>;
}

export function findTailscaleAddress(): string | null {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const entry of addresses ?? []) {
      if (entry.family === "IPv4" && isTailscaleAddress(entry.address)) return entry.address;
    }
  }
  return null;
}

/** A missing CLI or a failed call is ordinary, so nothing here warns. */
async function readTailscaleName(): Promise<string | null> {
  for (const command of CLI_PATHS) {
    try {
      const { stdout } = await run(command, ["status", "--json"], { timeout: CLI_TIMEOUT_MS });
      const parsed = StatusSchema.safeParse(JSON.parse(stdout));
      if (!parsed.success) continue;
      const name = parsed.data.Self.DNSName.replace(/\.$/, "");
      if (name !== "") return name;
    } catch {
      // Tailscale is optional. Try the next path, then give up quietly.
    }
  }
  return null;
}

export function createNetworkDetector(): NetworkDetector {
  let cachedName: string | null = null;
  let cachedAt = 0;

  return {
    address: findTailscaleAddress,
    async name() {
      if (Date.now() - cachedAt < NAME_CACHE_MS) return cachedName;
      cachedName = await readTailscaleName();
      cachedAt = Date.now();
      return cachedName;
    },
  };
}

/** `http://<name or address>:<port>`, or null when Tailscale is not running. */
export async function tailscaleUrl(detector: NetworkDetector, port: number): Promise<string | null> {
  const address = detector.address();
  if (address === null) return null;
  const name = await detector.name();
  return `http://${name ?? address}:${port}`;
}
