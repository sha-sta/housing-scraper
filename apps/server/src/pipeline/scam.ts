import type { ScamSignal } from "@housing/shared";

const WIRE_OR_GIFT_CARD =
  /western union|wire (?:the )?(?:transfer|money|funds|deposit)|gift ?cards?|money ?gram|zelle only|cash app only|\bbitcoin\b|\bcrypto\b|steam card/i;

const OUT_OF_COUNTRY =
  /out of (?:the )?country|currently (?:abroad|overseas|out of state|in another (?:state|country))|missionary|on a mission trip|military deployment|working (?:abroad|overseas)|relocated (?:abroad|overseas)/i;

const DEPOSIT_BEFORE_VIEWING =
  /deposit (?:before|prior to) (?:you )?(?:view|see|visit)|send (?:the )?(?:deposit|first month)[^.]{0,40}(?:before|prior)|no (?:viewing|showing)s? until|ship (?:the )?keys|keys will be (?:mailed|shipped)|pay (?:the )?(?:deposit|rent) (?:to|and) (?:receive|get) the keys/i;

/** The lowest fraction of the comparable median a real listing plausibly hits. */
const FAR_BELOW_RATIO = 0.5;
/** Fewer comparables than this and the median says nothing. */
const MIN_COMPARABLES = 5;

export interface ScamInput {
  price: number | null;
  address: string | null;
  photos: string[];
  text: string;
}

export interface ScamContext {
  /** Prices of active listings with the same bedroom count. */
  comparablePrices: number[];
  /** True when another stored listing has the same description at a different address. */
  textSeenAtAnotherAddress: boolean;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/** Signals never drop a listing. A profile decides whether flagged listings are hidden. */
export function computeScamSignals(input: ScamInput, context: ScamContext): ScamSignal[] {
  const signals: ScamSignal[] = [];

  if (input.price !== null && context.comparablePrices.length >= MIN_COMPARABLES) {
    if (input.price < median(context.comparablePrices) * FAR_BELOW_RATIO) signals.push("priceFarBelowArea");
  }
  if (WIRE_OR_GIFT_CARD.test(input.text)) signals.push("wireOrGiftCardLanguage");
  if (OUT_OF_COUNTRY.test(input.text)) signals.push("landlordOutOfCountry");
  if (DEPOSIT_BEFORE_VIEWING.test(input.text)) signals.push("depositBeforeViewing");
  if (context.textSeenAtAnotherAddress) signals.push("duplicateTextDifferentAddress");
  if (input.address === null && input.photos.length === 0) signals.push("noAddressNoPhotos");

  return signals;
}

/** Stable key for "the same words". Whitespace and punctuation vary between reposts. */
export function descriptionKey(description: string | null): string | null {
  if (description === null) return null;
  const normalized = description.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return normalized.length < 80 ? null : normalized;
}
