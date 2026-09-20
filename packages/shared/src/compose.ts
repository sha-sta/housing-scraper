import type { ComposeVia } from "./api.ts";

export interface ComposeMessage {
  to: string;
  subject: string;
  body: string;
}

/**
 * A link that opens a prefilled message in the user's own mailbox, so the email leaves from
 * their school address without the app holding any mail credentials.
 * encodeURIComponent is required for Outlook: it turns "+" encoded spaces into literal plus signs.
 */
export function composeUrl(via: ComposeVia, message: ComposeMessage): string {
  const to = encodeURIComponent(message.to);
  const subject = encodeURIComponent(message.subject);
  const body = encodeURIComponent(message.body);
  switch (via) {
    case "mailto":
      return `mailto:${to}?subject=${subject}&body=${body}`;
    case "outlook":
      return `https://outlook.office.com/mail/deeplink/compose?to=${to}&subject=${subject}&body=${body}`;
    case "gmail":
      return `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${subject}&body=${body}`;
  }
}
