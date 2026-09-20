import type { Identity, Listing, Profile } from "@housing/shared";

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/**
 * A line that existed only to carry a variable disappears when the variable is empty, and the
 * punctuation left behind by an empty variable in the middle of a sentence is cleaned up.
 */
function tidy(line: string): string {
  return line
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/,(\s*[,.;:])/g, "$1")
    .replace(/\.{2,}(?!\.)/g, ".")
    .replace(/[ \t]+$/g, "")
    .replace(/^[ \t]+(?=[,.;:!?])/g, "");
}

export function render(template: string, variables: Record<string, string>): string {
  const lines = template.split("\n").map((line) => {
    let hadPlaceholder = false;
    let hadEmpty = false;
    const filled = line.replace(PLACEHOLDER, (_match, name: string) => {
      hadPlaceholder = true;
      const value = variables[name] ?? "";
      if (value === "") hadEmpty = true;
      return value;
    });
    if (hadPlaceholder && filled.trim() === "") return null;
    return hadEmpty ? tidy(filled) : filled;
  });

  return lines
    .filter((line): line is string => line !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatDate(iso: string | null): string {
  if (iso === null) return "";
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** Every variable the template doc comment in packages/shared promises. */
export function templateVariables(listing: Listing, profile: Profile, identity: Identity): Record<string, string> {
  return {
    "listing.title": listing.title,
    "listing.address": listing.address ?? "",
    "listing.price": listing.price === null ? "" : `$${Math.round(listing.price).toLocaleString("en-US")}`,
    "listing.beds": listing.beds === null ? "" : String(listing.beds),
    "listing.url": listing.sources[0]?.url ?? "",
    "listing.availableDate": formatDate(listing.availableDate),
    "contact.name": listing.contact.name ?? "",
    "contact.company": listing.contact.company ?? "",
    "me.fullName": identity.fullName,
    "me.email": identity.email,
    "me.phone": identity.phone,
    "me.school": identity.school,
    "me.blurb": identity.blurb,
    "group.size": String(profile.preferences.group.size),
    "profile.moveIn": formatDate(profile.preferences.dates.moveInEarliest),
    "profile.name": profile.name,
  };
}
