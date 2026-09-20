import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { silentLogger } from "../src/log.ts";
import { parseCommand } from "../src/notify/commands.ts";
import { signDraftId, verifyDraftSignature } from "../src/notify/hmac.ts";
import { clampMessage, createNtfyClient, MAX_ACTIONS, truncateBytes } from "../src/notify/ntfy.ts";
import { buildMatchPush, fitMailtoUrl, matchBody, matchTitle } from "../src/notify/push.ts";
import { makeListing, makeProfile, NOW } from "./helpers.ts";
import { evaluate } from "../src/match/evaluate.ts";
import type { Draft } from "@housing/shared";

interface Captured {
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

let server: Server;
let base: string;
const captured: Captured[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
    });
    req.on("end", () => {
      captured.push({ path: req.url ?? "", headers: req.headers, body });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "fake", time: Math.floor(Date.now() / 1000) }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  base = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("ntfy publish", () => {
  it("posts the exact JSON body the ntfy API expects", async () => {
    captured.length = 0;
    const client = createNtfyClient({ server: () => base, token: null, log: silentLogger() });
    await client.publish({
      topic: "my-topic",
      title: "$3,000, 5 bd, 3210 Guilford Ave",
      message: "Score 82\n9 min walk",
      priority: 5,
      tags: ["house"],
      click: "http://localhost:4747/listings/lst_1",
      attach: "https://example.com/photo.jpg",
      actions: [
        { action: "view", label: "Open listing", url: "https://example.com/unit-1" },
        { action: "http", label: "Send email", url: `${base}/cmd`, method: "POST", body: "send:drf_1:abc" },
      ],
    });

    expect(captured).toHaveLength(1);
    const call = captured[0]!;
    expect(call.path).toBe("/");
    expect(call.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(call.body)).toEqual({
      topic: "my-topic",
      title: "$3,000, 5 bd, 3210 Guilford Ave",
      message: "Score 82\n9 min walk",
      priority: 5,
      tags: ["house"],
      click: "http://localhost:4747/listings/lst_1",
      attach: "https://example.com/photo.jpg",
      actions: [
        { action: "view", label: "Open listing", url: "https://example.com/unit-1" },
        { action: "http", label: "Send email", url: `${base}/cmd`, method: "POST", body: "send:drf_1:abc" },
      ],
    });
  });

  it("sends the access token as a bearer header", async () => {
    captured.length = 0;
    const client = createNtfyClient({ server: () => base, token: "tk_secret", log: silentLogger() });
    await client.publish({ topic: "t", title: "a", message: "b" });
    expect(captured[0]?.headers.authorization).toBe("Bearer tk_secret");
  });

  it("raises the server error text", async () => {
    const failing = createServer((_req, res) => {
      res.writeHead(429, { "content-type": "text/plain" });
      res.end("rate limit exceeded");
    });
    await new Promise<void>((resolve) => failing.listen(0, "127.0.0.1", resolve));
    const port = (failing.address() as AddressInfo).port;
    const client = createNtfyClient({
      server: () => `http://127.0.0.1:${port}`,
      token: null,
      log: silentLogger(),
    });
    await expect(client.publish({ topic: "t", title: "a", message: "b" })).rejects.toThrow(
      /ntfy returned 429: rate limit exceeded/,
    );
    await new Promise<void>((resolve) => failing.close(() => resolve()));
  });
});

describe("ntfy limits", () => {
  it("truncates by bytes, not by characters", () => {
    expect(truncateBytes("abcdef", 100)).toBe("abcdef");
    expect(truncateBytes("abcdefghij", 8)).toBe("abcde...");
    expect(new TextEncoder().encode(truncateBytes("é".repeat(100), 20)).length).toBeLessThanOrEqual(20);
  });

  it("drops actions past the ntfy limit of three", () => {
    const clamped = clampMessage({
      topic: "t",
      title: "a",
      message: "b",
      actions: [
        { action: "view", label: "one", url: "https://example.com/1" },
        { action: "view", label: "two", url: "https://example.com/2" },
        { action: "view", label: "three", url: "https://example.com/3" },
        { action: "view", label: "four", url: "https://example.com/4" },
      ],
    });
    expect(clamped.actions).toHaveLength(MAX_ACTIONS);
    expect(clamped.actions?.map((a) => a.label)).toEqual(["one", "two", "three"]);
  });

  it("keeps a very long title and body inside the documented caps", () => {
    const clamped = clampMessage({ topic: "t", title: "x".repeat(4000), message: "y".repeat(9000) });
    expect(new TextEncoder().encode(clamped.title).length).toBeLessThanOrEqual(1024);
    expect(new TextEncoder().encode(clamped.message).length).toBeLessThanOrEqual(4096);
  });
});

describe("push composition", () => {
  const listing = makeListing({ price: 3000, beds: 5 });
  const profile = makeProfile();
  const match = evaluate(listing, profile, NOW);
  const context = {
    dashboardUrl: "http://localhost:4747",
    ntfyServer: "https://ntfy.sh",
    commandTopic: "secret-topic",
    appSecret: "s3cret",
    smtpConfigured: false,
  };

  const emailDraft: Draft = {
    id: "drf_1",
    listingId: listing.id,
    profileId: profile.id,
    channel: "email",
    to: "leasing@example.com",
    subject: "Tour request",
    body: "Hello, we are a group of six students. Could we see the unit this week?",
    status: "staged",
    generatedBy: "template",
    error: null,
    createdAt: NOW.toISOString(),
    sentAt: null,
  };

  it("titles with price, beds, and address and bodies with the match facts", () => {
    expect(matchTitle(listing)).toBe("$3,000, 5 bd, 3210 Guilford Ave, Baltimore, MD 21218");
    const body = matchBody(listing, match);
    expect(body).toContain("Score ");
    expect(body).toContain("per person");
    expect(body).toContain("min walk");
    expect(body).toContain("available 2027-06-01");
    expect(body).toContain("via demo");
  });

  it("offers a mailto compose action when SMTP is off, plus a mark contacted action", () => {
    const push = buildMatchPush(listing, match, profile, emailDraft, context);
    expect(push.actions).toHaveLength(3);
    expect(push.actions[0]).toEqual({
      action: "view",
      label: "Open listing",
      url: "https://example.com/unit-1",
    });
    expect(push.actions[1]?.action).toBe("view");
    expect(push.actions[1]?.label).toBe("Email landlord");
    expect(push.actions[1]?.url.startsWith("mailto:leasing%40example.com?")).toBe(true);
    expect(push.actions[2]).toEqual({
      action: "http",
      label: "Mark contacted",
      url: "https://ntfy.sh/secret-topic",
      method: "POST",
      body: `sent:drf_1:${signDraftId("drf_1", "s3cret")}`,
    });
  });

  it("offers the signed send action when SMTP is configured", () => {
    const push = buildMatchPush(listing, match, profile, emailDraft, { ...context, smtpConfigured: true });
    expect(push.actions).toHaveLength(2);
    expect(push.actions[1]).toEqual({
      action: "http",
      label: "Send email",
      url: "https://ntfy.sh/secret-topic",
      method: "POST",
      body: `send:drf_1:${signDraftId("drf_1", "s3cret")}`,
    });
  });

  it("uses an sms link for a phone only listing and a link for a form only listing", () => {
    const sms = buildMatchPush(listing, match, profile, { ...emailDraft, channel: "sms", to: "(410) 555-1234" }, context);
    expect(sms.actions[1]).toEqual({ action: "view", label: "Text landlord", url: "sms:4105551234" });

    const form = buildMatchPush(
      listing,
      match,
      profile,
      { ...emailDraft, channel: "form", to: "https://example.com/inquire/1" },
      context,
    );
    expect(form.actions[1]).toEqual({
      action: "view",
      label: "Open reply form",
      url: "https://example.com/inquire/1",
    });
  });

  it("gives roommates only the open listing action", () => {
    const push = buildMatchPush(listing, match, profile, emailDraft, context);
    expect(push.shareActions).toEqual([
      { action: "view", label: "Open listing", url: "https://example.com/unit-1" },
    ]);
  });

  it("raises the priority at the urgent score", () => {
    const urgent = buildMatchPush(listing, { ...match, score: 90 }, profile, null, context);
    const normal = buildMatchPush(listing, { ...match, score: 60 }, profile, null, context);
    expect(urgent.priority).toBe(5);
    expect(normal.priority).toBe(4);
  });

  it("attaches the first photo and taps through somewhere a phone can open", () => {
    // The fixture dashboard is localhost, which a phone cannot reach, so the source page wins.
    const push = buildMatchPush(listing, match, profile, null, context);
    expect(push.click).toBe("https://example.com/unit-1");
    expect(push.attach).toBe("https://example.com/photo.jpg");

    const reachable = { ...context, dashboardUrl: "http://macbook.tail1234.ts.net:4747" };
    expect(buildMatchPush(listing, match, profile, null, reachable).click).toBe(
      `http://macbook.tail1234.ts.net:4747/listings/${listing.id}`,
    );
  });
});

describe("fitMailtoUrl", () => {
  it("leaves a short body alone", () => {
    const url = fitMailtoUrl("a@b.com", "Hi", "One sentence.");
    expect(decodeURIComponent(url)).toContain("One sentence.");
  });

  it("trims a long body at a sentence boundary and stays under the limit", () => {
    const body = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} of the outreach email.`).join(" ");
    const url = fitMailtoUrl("leasing@example.com", "Tour request", body);
    expect(url.length).toBeLessThanOrEqual(1800);
    expect(decodeURIComponent(url).trimEnd().endsWith(".")).toBe(true);
  });

  it("hard trims a single sentence that is too long on its own", () => {
    const url = fitMailtoUrl("a@b.com", "s", "x".repeat(5000));
    expect(url.length).toBeLessThanOrEqual(1800);
  });
});

describe("command signatures", () => {
  it("verifies its own signature", () => {
    const signature = signDraftId("drf_1", "secret");
    expect(signature).toHaveLength(64);
    expect(verifyDraftSignature("drf_1", signature, "secret")).toBe(true);
  });

  it("rejects a signature for another draft, another secret, or a tampered value", () => {
    const signature = signDraftId("drf_1", "secret");
    expect(verifyDraftSignature("drf_2", signature, "secret")).toBe(false);
    expect(verifyDraftSignature("drf_1", signature, "other")).toBe(false);
    expect(verifyDraftSignature("drf_1", `${signature.slice(0, 63)}0`, "secret")).toBe(false);
  });

  it("rejects a signature of the wrong length without throwing", () => {
    expect(verifyDraftSignature("drf_1", "short", "secret")).toBe(false);
    expect(verifyDraftSignature("drf_1", "", "secret")).toBe(false);
  });
});

describe("parseCommand", () => {
  it("reads both verbs", () => {
    const signature = "a".repeat(64);
    expect(parseCommand(`send:drf_1:${signature}`)).toEqual({
      verb: "send",
      draftId: "drf_1",
      signature,
    });
    expect(parseCommand(`sent:drf_1:${signature}`)?.verb).toBe("sent");
    expect(parseCommand(` send:drf_1:${signature}\n`)?.draftId).toBe("drf_1");
  });

  it("rejects anything that is not a command", () => {
    expect(parseCommand("hello")).toBeNull();
    expect(parseCommand("send:drf_1:nothex")).toBeNull();
    expect(parseCommand("delete:drf_1:" + "a".repeat(64))).toBeNull();
    expect(parseCommand("send::" + "a".repeat(64))).toBeNull();
  });
});
