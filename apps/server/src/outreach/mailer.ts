import nodemailer from "nodemailer";
import type { SmtpConfig } from "../env.ts";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  configured: boolean;
  send(message: MailMessage): Promise<void>;
  verify(): Promise<void>;
}

/**
 * SMTP is optional. Without it the dashboard and the pushes hand the user a prefilled compose
 * link instead, which is the default way this app sends outreach.
 */
export function createMailer(config: SmtpConfig | null): Mailer {
  if (config === null) {
    return {
      configured: false,
      async send() {
        throw new Error("SMTP is not configured. Use the compose link or mark the draft sent by hand.");
      },
      async verify() {
        throw new Error("SMTP is not configured.");
      },
    };
  }

  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
  });

  return {
    configured: true,
    async send(message) {
      await transport.sendMail({
        from: config.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
    },
    async verify() {
      await transport.verify();
    },
  };
}

/** Test double: nodemailer's JSON transport keeps the message in memory instead of sending it. */
export function createJsonMailer(from: string, sink: (json: string) => void): Mailer {
  const transport = nodemailer.createTransport({ jsonTransport: true });
  return {
    configured: true,
    async send(message) {
      const info = await transport.sendMail({
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
      sink(String(info.message));
    },
    async verify() {},
  };
}
