import { describe, expect, it } from "vitest";
import { createJsonMailer, createMailer } from "../src/outreach/mailer.ts";
import { chooseChannel } from "../src/outreach/drafts.ts";

describe("createMailer without SMTP", () => {
  it("reports itself unconfigured, which is a supported state", () => {
    expect(createMailer(null).configured).toBe(false);
  });

  it("explains itself instead of pretending to send", async () => {
    const mailer = createMailer(null);
    await expect(mailer.send({ to: "a@b.com", subject: "s", text: "t" })).rejects.toThrow(/SMTP is not configured/);
    await expect(mailer.verify()).rejects.toThrow(/SMTP is not configured/);
  });
});

describe("createMailer with SMTP", () => {
  it("builds a transport and reports itself configured", () => {
    const mailer = createMailer({
      host: "smtp.example.com",
      port: 465,
      user: "me@example.com",
      pass: "secret",
      from: "me@example.com",
    });
    expect(mailer.configured).toBe(true);
  });
});

describe("the nodemailer test transport", () => {
  it("captures the message instead of sending it", async () => {
    const captured: string[] = [];
    const mailer = createJsonMailer("me@example.edu", (json) => captured.push(json));
    await mailer.send({
      to: "leasing@example.com",
      subject: "Tour request for 3210 Guilford Ave",
      text: "Hello, we are a group of six students.",
    });

    expect(captured).toHaveLength(1);
    const message: unknown = JSON.parse(captured[0]!);
    expect(message).toMatchObject({
      from: { address: "me@example.edu" },
      to: [{ address: "leasing@example.com" }],
      subject: "Tour request for 3210 Guilford Ave",
      text: "Hello, we are a group of six students.",
    });
  });
});

describe("chooseChannel", () => {
  const empty = { name: null, company: null, email: null, phone: null, formUrl: null };

  it("prefers email", () => {
    expect(chooseChannel({ ...empty, email: "a@b.com", phone: "(410) 555-1234" })).toBe("email");
  });

  it("falls back to sms when only a phone number is known", () => {
    expect(chooseChannel({ ...empty, phone: "(410) 555-1234", formUrl: "https://x" })).toBe("sms");
  });

  it("falls back to a form when that is all there is", () => {
    expect(chooseChannel({ ...empty, formUrl: "https://example.com/inquire" })).toBe("form");
  });

  it("returns null when there is no way to reach anyone", () => {
    expect(chooseChannel(empty)).toBeNull();
    expect(chooseChannel({ ...empty, email: "" })).toBeNull();
  });
});
