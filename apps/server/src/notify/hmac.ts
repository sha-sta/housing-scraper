import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A push action carries a signature, not a session. A leaked command topic lets an attacker do
 * nothing without this, and a leaked signature covers only the one draft the owner already staged.
 */
export function signDraftId(draftId: string, secret: string): string {
  return createHmac("sha256", secret).update(draftId).digest("hex");
}

export function verifyDraftSignature(draftId: string, signature: string, secret: string): boolean {
  const expected = Buffer.from(signDraftId(draftId, secret), "utf8");
  const given = Buffer.from(signature, "utf8");
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}
