import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHttpClient } from "../src/http.ts";
import { SourceBlockedError, type Logger } from "../src/types.ts";

const silent: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

interface Hit {
  path: string;
  at: number;
  headers: Record<string, string | string[] | undefined>;
}

let server: Server;
let origin: string;
const hits: Hit[] = [];
let flakyAttempts = 0;

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = req.url ?? "/";
    hits.push({ path, at: Date.now(), headers: req.headers });

    if (path === "/ok") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (path === "/forbidden") {
      res.writeHead(403);
      res.end("no");
      return;
    }
    if (path === "/rate-limited") {
      res.writeHead(429);
      res.end("slow down");
      return;
    }
    if (path === "/challenge") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html><head><title>Just a moment...</title></head><body>checking</body></html>");
      return;
    }
    if (path === "/flaky") {
      flakyAttempts++;
      if (flakyAttempts < 3) {
        res.writeHead(503);
        res.end("try again");
        return;
      }
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(`recovered after ${flakyAttempts}`);
      return;
    }
    if (path === "/always-500") {
      res.writeHead(500);
      res.end("broken");
      return;
    }
    res.writeHead(404);
    res.end("missing");
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

describe("createHttpClient", () => {
  it("returns status, body and parsed JSON", async () => {
    const http = createHttpClient({ log: silent, minDelayMsPerHost: 0 });
    const res = await http.fetch(`${origin}/ok`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers["content-type"]).toBe("application/json");
  });

  it("waits the per-host minimum between two requests to the same host", async () => {
    const http = createHttpClient({ log: silent, minDelayMsPerHost: 250 });
    hits.length = 0;
    await http.fetch(`${origin}/ok`);
    await http.fetch(`${origin}/ok`);
    expect(hits).toHaveLength(2);
    const gap = (hits[1]?.at ?? 0) - (hits[0]?.at ?? 0);
    expect(gap).toBeGreaterThanOrEqual(200);
  });

  it("serializes concurrent requests to the same host", async () => {
    const http = createHttpClient({ log: silent, minDelayMsPerHost: 150 });
    hits.length = 0;
    await Promise.all([
      http.fetch(`${origin}/ok`),
      http.fetch(`${origin}/ok`),
      http.fetch(`${origin}/ok`),
    ]);
    expect(hits).toHaveLength(3);
    const first = hits[0]?.at ?? 0;
    expect((hits[2]?.at ?? 0) - first).toBeGreaterThanOrEqual(250);
  });

  it("throws SourceBlockedError on 403", async () => {
    const http = createHttpClient({ log: silent, minDelayMsPerHost: 0 });
    await expect(http.fetch(`${origin}/forbidden`)).rejects.toBeInstanceOf(SourceBlockedError);
  });

  it("throws SourceBlockedError on 429", async () => {
    const http = createHttpClient({ log: silent, minDelayMsPerHost: 0 });
    await expect(http.fetch(`${origin}/rate-limited`)).rejects.toBeInstanceOf(SourceBlockedError);
  });

  it("throws SourceBlockedError on a recognizable challenge page", async () => {
    const http = createHttpClient({ log: silent, minDelayMsPerHost: 0 });
    await expect(http.fetch(`${origin}/challenge`)).rejects.toThrow(/challenge page/);
  });

  it("does not retry a block", async () => {
    const http = createHttpClient({ log: silent, minDelayMsPerHost: 0, retries: 3 });
    hits.length = 0;
    await expect(http.fetch(`${origin}/forbidden`)).rejects.toBeInstanceOf(SourceBlockedError);
    expect(hits.filter((h) => h.path === "/forbidden")).toHaveLength(1);
  });

  it("retries a 5xx and succeeds", async () => {
    const http = createHttpClient({ log: silent, minDelayMsPerHost: 10, retries: 3 });
    flakyAttempts = 0;
    const res = await http.fetch(`${origin}/flaky`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("recovered after 3");
  });

  it("gives up after the retry budget and reports the status", async () => {
    const http = createHttpClient({ log: silent, minDelayMsPerHost: 5, retries: 2 });
    hits.length = 0;
    await expect(http.fetch(`${origin}/always-500`)).rejects.toThrow(/answered 500/);
    expect(hits.filter((h) => h.path === "/always-500")).toHaveLength(3);
  });

  it("sends the full Chrome header set only when asked", async () => {
    const http = createHttpClient({ log: silent, minDelayMsPerHost: 0 });
    hits.length = 0;
    await http.fetch(`${origin}/ok`, { browserHeaders: true });
    await http.fetch(`${origin}/ok`);
    const withHeaders = hits[0]?.headers ?? {};
    const without = hits[1]?.headers ?? {};
    expect(withHeaders["sec-fetch-dest"]).toBe("document");
    expect(withHeaders["sec-fetch-site"]).toBe("none");
    expect(withHeaders["sec-ch-ua"]).toContain("Chromium");
    expect(withHeaders["upgrade-insecure-requests"]).toBe("1");
    expect(without["sec-fetch-dest"]).toBeUndefined();
    expect(without["upgrade-insecure-requests"]).toBeUndefined();
    expect(without["user-agent"]).toContain("Chrome/");
  });

  it("cannot set Sec-Fetch-Mode, which undici owns, and the sources accept that", async () => {
    // Node's fetch writes Sec-Fetch-Mode itself. offcampushousing.jhu.edu still answers 200,
    // so the built-in fetch is enough and no custom HTTP stack is needed.
    const http = createHttpClient({ log: silent, minDelayMsPerHost: 0 });
    hits.length = 0;
    await http.fetch(`${origin}/ok`, { browserHeaders: true });
    expect(hits[0]?.headers["sec-fetch-mode"]).toBe("cors");
  });

  it("lets a caller override a header and pass an abort signal", async () => {
    const http = createHttpClient({ log: silent, minDelayMsPerHost: 0 });
    hits.length = 0;
    await http.fetch(`${origin}/ok`, {
      browserHeaders: true,
      headers: { Accept: "application/json", Referer: "https://example.com/" },
      signal: AbortSignal.timeout(5000),
    });
    expect(hits[0]?.headers["accept"]).toBe("application/json");
    expect(hits[0]?.headers["referer"]).toBe("https://example.com/");
  });

  it("aborts when the caller's signal fires", async () => {
    const http = createHttpClient({ log: silent, minDelayMsPerHost: 0 });
    const controller = new AbortController();
    controller.abort();
    await expect(http.fetch(`${origin}/ok`, { signal: controller.signal })).rejects.toThrow();
  });
});
