const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

/**
 * An ntfy topic is the only secret protecting a push, so it has to be long and random.
 * Ambiguous characters are left out because people read these off a screen.
 */
export function randomTopic(prefix = "housing"): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return `${prefix}-${out}`;
}

export function subscribeUrl(server: string, topic: string): string {
  const base = server.trim().replace(/\/+$/, "");
  return `${base}/${topic}`;
}
