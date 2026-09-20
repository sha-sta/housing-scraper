import Anthropic from "@anthropic-ai/sdk";
import type { Listing } from "@housing/shared";
import type { Logger } from "../log.ts";

const MAX_TOKENS = 2000;
const MAX_DESCRIPTION_CHARS = 2000;

const SYSTEM_PROMPT = [
  "You rewrite a student's outreach email to a landlord so it refers to the specific listing.",
  "Rules you must follow:",
  "1. Never invent a fact about the sender. Use only the names, numbers, and dates already in the draft.",
  "2. Never invent a fact about the listing. Use only what the listing text says.",
  "3. Keep the email under 150 words.",
  "4. Keep the sender's sign-off exactly as written.",
  "5. Plain sentences. No emoji, no dashes standing in for commas, no marketing language.",
  "6. Return the email body only, with no preamble and no subject line.",
].join("\n");

export interface Personalizer {
  personalize(draftBody: string, listing: Listing): Promise<string | null>;
}

export interface PersonalizerOptions {
  apiKey: string | null;
  model: string;
  log: Logger;
  client?: Anthropic;
}

/**
 * Optional. When it is off or the call fails, the rendered template is what gets staged, which is
 * already a complete email.
 */
export function createPersonalizer(options: PersonalizerOptions): Personalizer {
  if (options.apiKey === null && options.client === undefined) {
    return { personalize: async () => null };
  }
  const client = options.client ?? new Anthropic({ apiKey: options.apiKey ?? undefined });

  return {
    async personalize(draftBody, listing) {
      const details = [
        `Title: ${listing.title}`,
        listing.address === null ? null : `Address: ${listing.address}`,
        listing.price === null ? null : `Price: $${listing.price}`,
        listing.beds === null ? null : `Bedrooms: ${listing.beds}`,
        listing.description === null ? null : `Description: ${listing.description.slice(0, MAX_DESCRIPTION_CHARS)}`,
      ]
        .filter((line): line is string => line !== null)
        .join("\n");

      try {
        const response = await client.messages.create({
          model: options.model,
          max_tokens: MAX_TOKENS,
          system: SYSTEM_PROMPT,
          output_config: { effort: "low" },
          messages: [
            {
              role: "user",
              content: `Listing:\n${details}\n\nDraft email:\n${draftBody}\n\nRewrite the draft.`,
            },
          ],
        });
        if (response.stop_reason === "refusal") {
          options.log.warn("draft personalization declined", { model: options.model });
          return null;
        }
        const text = response.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("")
          .trim();
        return text === "" ? null : text;
      } catch (error) {
        options.log.warn("draft personalization failed", { model: options.model, error: String(error) });
        return null;
      }
    },
  };
}
