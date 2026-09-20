import { request as httpRequest, type ClientRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { z } from "zod";
import type { Logger } from "../log.ts";
import type { DraftService } from "../outreach/drafts.ts";
import { verifyDraftSignature } from "./hmac.ts";

/** A tap that arrived while the process was down is honoured, an old replay is not. */
const MAX_COMMAND_AGE_MS = 10 * 60 * 1000;
const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 60_000;

const StreamMessageSchema = z.object({
  id: z.string(),
  time: z.number(),
  event: z.string(),
  message: z.string().optional(),
});

const COMMAND = /^(send|sent):([A-Za-z0-9_-]+):([a-f0-9]{64})$/;

export interface ParsedCommand {
  verb: "send" | "sent";
  draftId: string;
  signature: string;
}

export function parseCommand(body: string): ParsedCommand | null {
  const match = COMMAND.exec(body.trim());
  if (match === null) return null;
  return { verb: match[1] === "sent" ? "sent" : "send", draftId: match[2]!, signature: match[3]! };
}

export interface CommandListener {
  start(): void;
  stop(): void;
}

export interface CommandListenerOptions {
  server: () => string;
  topic: string;
  appSecret: string;
  token: string | null;
  drafts: DraftService;
  log: Logger;
}

/**
 * The subscription is a raw node:https request rather than fetch on purpose. A long lived fetch
 * response occupies the shared connection pool for that origin, which makes every later publish to
 * the same ntfy server time out.
 */
function openLineStream(
  url: URL,
  headers: Record<string, string>,
  onLine: (line: string) => Promise<void>,
): { request: ClientRequest; done: Promise<void> } {
  const send = url.protocol === "http:" ? httpRequest : httpsRequest;
  let request: ClientRequest | null = null;

  const done = new Promise<void>((resolve, reject) => {
    request = send(url, { method: "GET", headers }, (response: IncomingMessage) => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`ntfy subscription returned ${response.statusCode ?? 0}`));
        return;
      }
      response.setEncoding("utf8");
      let buffer = "";
      let chain: Promise<void> = Promise.resolve();
      response.on("data", (chunk: string) => {
        buffer += chunk;
        let newline = buffer.indexOf("\n");
        while (newline >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf("\n");
          if (line !== "") chain = chain.then(() => onLine(line));
        }
      });
      response.on("end", () => void chain.then(resolve, reject));
      response.on("error", reject);
    });
    request.on("error", reject);
    request.end();
  });

  if (request === null) throw new Error("the subscription request was not created");
  return { request, done };
}

export function createCommandListener(options: CommandListenerOptions): CommandListener {
  let lastMessageId: string | null = null;
  let current: ClientRequest | null = null;
  let running = false;

  async function handle(raw: string, sentAtMs: number): Promise<void> {
    const command = parseCommand(raw);
    if (command === null) return;
    if (Date.now() - sentAtMs > MAX_COMMAND_AGE_MS) {
      options.log.warn("ignored a command older than ten minutes", { verb: command.verb });
      return;
    }
    if (!verifyDraftSignature(command.draftId, command.signature, options.appSecret)) {
      options.log.warn("rejected a command with a bad signature", { verb: command.verb });
      return;
    }

    try {
      if (command.verb === "send") await options.drafts.send(command.draftId);
      else await options.drafts.markSent(command.draftId);
      options.log.info("command applied", { verb: command.verb, draftId: command.draftId });
    } catch (error) {
      options.log.warn("command failed", { verb: command.verb, draftId: command.draftId, error: String(error) });
    }
  }

  async function onLine(line: string): Promise<void> {
    const parsed = StreamMessageSchema.safeParse(JSON.parse(line));
    if (!parsed.success || parsed.data.event !== "message") return;
    lastMessageId = parsed.data.id;
    if (parsed.data.message !== undefined) await handle(parsed.data.message, parsed.data.time * 1000);
  }

  async function connect(): Promise<void> {
    const url = new URL(`${options.server().replace(/\/+$/, "")}/${options.topic}/json`);
    // Resuming from the last id means a Send tap made while the process was reconnecting still lands.
    if (lastMessageId !== null) url.searchParams.set("since", lastMessageId);

    const headers: Record<string, string> = {};
    if (options.token !== null) headers.authorization = `Bearer ${options.token}`;

    const stream = openLineStream(url, headers, onLine);
    current = stream.request;
    await stream.done;
  }

  async function loop(): Promise<void> {
    let backoff = MIN_BACKOFF_MS;
    while (running) {
      try {
        await connect();
        backoff = MIN_BACKOFF_MS;
      } catch (error) {
        if (!running) return;
        options.log.warn("command subscription dropped", { error: String(error), retryInMs: backoff });
        await new Promise((resolve) => setTimeout(resolve, backoff));
        backoff = Math.min(MAX_BACKOFF_MS, backoff * 2);
      }
    }
  }

  return {
    start() {
      if (running) return;
      running = true;
      // The topic name is a secret, so it never reaches the log.
      options.log.info("listening for push commands");
      void loop();
    },
    stop() {
      running = false;
      current?.destroy();
      current = null;
    },
  };
}
