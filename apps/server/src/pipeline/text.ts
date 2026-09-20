import { AMENITIES, type Amenity, type AmenityMap, type PriceBasis, type PropertyType } from "@housing/shared";

// Listing sites bury the facts in prose. Everything here reads that prose and nothing else, so it
// stays pure and testable. Patterns are deliberately conservative: a wrong amenity is worse than a
// missing one, because a "must" filter silently drops good listings.

const SUFFIXES: Record<string, string> = {
  street: "st",
  str: "st",
  st: "st",
  avenue: "ave",
  ave: "ave",
  av: "ave",
  road: "rd",
  rd: "rd",
  boulevard: "blvd",
  blvd: "blvd",
  drive: "dr",
  dr: "dr",
  lane: "ln",
  ln: "ln",
  court: "ct",
  ct: "ct",
  place: "pl",
  pl: "pl",
  terrace: "ter",
  ter: "ter",
  parkway: "pkwy",
  pkwy: "pkwy",
  circle: "cir",
  cir: "cir",
  square: "sq",
  sq: "sq",
  highway: "hwy",
  hwy: "hwy",
  alley: "aly",
  way: "way",
};

const DIRECTIONS: Record<string, string> = {
  north: "n",
  south: "s",
  east: "e",
  west: "w",
  northeast: "ne",
  northwest: "nw",
  southeast: "se",
  southwest: "sw",
  n: "n",
  s: "s",
  e: "e",
  w: "w",
  ne: "ne",
  nw: "nw",
  se: "se",
  sw: "sw",
};

const UNIT_PATTERN = /(?:\bapt\b|\bapartment\b|\bunit\b|\bste\b|\bsuite\b|#)\s*\.?\s*([a-z0-9][a-z0-9-]*)/i;

// Two-letter tokens that are states rather than directions, so "md" prints as "MD".
const STATES = new Set([
  "al", "ak", "az", "ar", "ca", "co", "ct", "de", "dc", "fl", "ga", "hi", "id", "il", "in", "ia",
  "ks", "ky", "la", "me", "md", "ma", "mi", "mn", "ms", "mo", "mt", "nb", "nv", "nh", "nj", "nm",
  "ny", "nc", "nd", "oh", "ok", "or", "pa", "ri", "sc", "sd", "tn", "tx", "ut", "vt", "va", "wa",
  "wv", "wi", "wy",
]);

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

interface AmenityRule {
  yes: RegExp;
  no?: RegExp;
}

const AMENITY_RULES: Record<Amenity, AmenityRule> = {
  laundryInUnit: {
    yes: /in[-\s]?unit laundry|laundry in[-\s]?unit|washer\s*(?:\/|and|&|\+)\s*dryer|\bw\/d\b|washer and dryer in|private laundry/i,
    no: /laundry (?:room|on[-\s]site)|shared laundry|coin[-\s]?op/i,
  },
  laundryInBuilding: {
    yes: /laundry (?:room|on[-\s]site|in (?:the )?building|facilit)|coin[-\s]?op(?:erated)? laundry|shared laundry|basement laundry/i,
  },
  dishwasher: { yes: /dishwasher|\bd\/w\b/i, no: /no dishwasher/i },
  airConditioning: {
    yes: /air[-\s]?condition|central air|\ba\/c\b|\bac unit\b|mini[-\s]?split|window units?\b/i,
    no: /no (?:a\/c|air[-\s]?condition)/i,
  },
  parking: {
    yes: /\bparking\b|\bgarage\b|\bcarport\b|\bdriveway\b/i,
    no: /no parking|parking not included|street parking only|no (?:off[-\s]street )?parking available/i,
  },
  furnished: { yes: /\bfurnished\b|comes furnished|fully furnished/i, no: /\bunfurnished\b|not furnished/i },
  catsAllowed: {
    yes: /cats?\s*(?:are\s*)?(?:ok|okay|welcome|allowed|friendly)|cat[-\s]friendly|pets?\s*(?:are\s*)?(?:ok|okay|welcome|allowed|friendly)|pet[-\s]friendly/i,
    no: /no cats|no pets|pets? (?:are )?not (?:allowed|permitted)|pet[-\s]free/i,
  },
  dogsAllowed: {
    yes: /dogs?\s*(?:are\s*)?(?:ok|okay|welcome|allowed|friendly)|dog[-\s]friendly|pets?\s*(?:are\s*)?(?:ok|okay|welcome|allowed|friendly)|pet[-\s]friendly/i,
    no: /no dogs|no pets|pets? (?:are )?not (?:allowed|permitted)|cats only|pet[-\s]free/i,
  },
  outdoorSpace: {
    yes: /back\s?yard|\bpatio\b|\bbalcony\b|\bdeck\b|\bterrace\b|roof\s?deck|private yard|\bgarden\b|\bporch\b/i,
  },
  elevator: { yes: /\belevator\b|\blift\b/i, no: /no elevator|walk[-\s]?up only/i },
  gym: { yes: /\bgym\b|fitness (?:center|centre|room)|workout room|exercise room/i },
  utilitiesIncluded: {
    yes: /utilities included|includes? (?:all )?utilities|all utilities paid|heat (?:and|&|\+) (?:hot )?water included|water included|heat included/i,
    no: /utilities not included|tenant pays (?:all )?utilities|plus utilities/i,
  },
  wheelchairAccessible: {
    yes: /wheelchair|ada[-\s]accessible|handicap(?:ped)? accessible|accessible unit|step[-\s]?free/i,
  },
};

const PROPERTY_PATTERNS: [PropertyType, RegExp][] = [
  ["room", /\bprivate room\b|room for rent|room in (?:a |an |the )?(?:shared |)(?:house|apartment|home|rowhome)|roommate wanted|room available in/i],
  ["studio", /\bstudio\b|\befficiency apartment\b/i],
  ["rowhome", /\brow\s?home\b|\brow\s?house\b|\btown\s?home\b|\btown\s?house\b|\browhouse\b|\bterraced house\b/i],
  ["house", /\bentire house\b|\bwhole house\b|\bsingle[-\s]family\b|\bdetached (?:house|home)\b|\bhouse for rent\b|\bwhole home\b/i],
  ["condo", /\bcondo(?:minium)?\b/i],
  ["apartment", /\bapartment\b|\bapt\.?\b|\bflat\b/i],
];

const INCOME_RESTRICTED =
  /income[-\s]restricted|income restrictions?|income limits?|income[-\s]qualified|must meet income|\blihtc\b|\bami\b|area median income|tax credit (?:property|community)|affordable housing program|section 8 only|subsidi[sz]ed housing/i;

const SENIOR_HOUSING =
  /senior (?:housing|living|community|apartments)|\b55\s*\+|\b62\s*\+|55 (?:years )?(?:or|and) older|62 (?:years )?(?:or|and) older|age[-\s]restricted|active adult community|seniors only/i;

const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi;
const PHONE_PATTERN = /(?<![$\d])(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})(?!\d)/g;

// Student row homes are routinely advertised by the room. Reading that wrong turns an $850 room
// into an $850 house and buries the listings this app exists to find.
const PER_ROOM =
  /per\s*room|per\s*bedroom|per\s*bed\b|per\s*person|\/\s*room|\/\s*bedroom|\/\s*bed\b|each\s*room|\d+\s*bedrooms?\s*available|rooms?\s*available/i;

/** Below this per bedroom, a multi bedroom listing is quoting one room, not the building. */
export const ROOM_PRICE_CEILING = 450;

export function inferPriceBasis(text: string, beds: number | null, price: number | null): PriceBasis {
  if (PER_ROOM.test(text)) return "room";
  if (beds !== null && beds >= 2 && price !== null && price / beds < ROOM_PRICE_CEILING) return "room";
  return "unit";
}

const NON_HOUSING = /parking\s*spot|parking\s*space|\bgarage\b|storage\s*unit|secure\s*parking/i;
// "rowhome" and "townhouse" carry "home" and "house", which is what keeps them out of this net.
const HOUSING_WORDS = /bedroom|apartment|house|home/i;

/** A parking spot is not a place to live. Only bedroom-less rows are ever considered. */
export function isNonHousing(title: string, beds: number | null): boolean {
  if (beds !== null) return false;
  return NON_HOUSING.test(title) && !HOUSING_WORDS.test(title);
}

export function detectIncomeRestricted(text: string): boolean {
  return INCOME_RESTRICTED.test(text);
}

export function detectSeniorHousing(text: string): boolean {
  return SENIOR_HOUSING.test(text);
}

export function extractAmenities(text: string): AmenityMap {
  const found: AmenityMap = {};
  for (const amenity of AMENITIES) {
    const rule = AMENITY_RULES[amenity];
    if (rule.no !== undefined && rule.no.test(text)) {
      found[amenity] = false;
      continue;
    }
    if (rule.yes.test(text)) found[amenity] = true;
  }
  return found;
}

export function inferPropertyType(text: string): PropertyType | null {
  for (const [type, pattern] of PROPERTY_PATTERNS) {
    if (pattern.test(text)) return type;
  }
  return null;
}

export function extractEmail(text: string): string | null {
  EMAIL_PATTERN.lastIndex = 0;
  const match = EMAIL_PATTERN.exec(text);
  return match === null ? null : match[0].toLowerCase();
}

export function extractPhone(text: string): string | null {
  PHONE_PATTERN.lastIndex = 0;
  const match = PHONE_PATTERN.exec(text);
  if (match === null) return null;
  return `(${match[1]}) ${match[2]}-${match[3]}`;
}

function isoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

/** A listing that says "available June 1" means the next June 1, not one in the past. */
function inferYear(month: number, day: number, now: Date): number {
  const year = now.getUTCFullYear();
  const candidate = Date.UTC(year, month - 1, day);
  return candidate >= Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) ? year : year + 1;
}

export function extractAvailableDate(text: string, now: Date): string | null {
  if (/available\s*(?::|-)?\s*(?:now|immediately|asap|today)|move[-\s]?in (?:now|immediately|today)/i.test(text)) {
    return now.toISOString().slice(0, 10);
  }

  const iso = /(?:avail(?:able)?|move[-\s]?in)\b[^\n]{0,20}?(\d{4})-(\d{2})-(\d{2})/i.exec(text);
  if (iso !== null) {
    return isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const monthNames = Object.keys(MONTHS).join("|");
  const named = new RegExp(
    `(?:avail(?:able)?\\.?|move[-\\s]?in)\\b[^\\n]{0,20}?\\b(${monthNames})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?`,
    "i",
  ).exec(text);
  if (named !== null) {
    const month = MONTHS[named[1]!.toLowerCase()];
    const day = Number(named[2]);
    if (month !== undefined) {
      const year = named[3] === undefined ? inferYear(month, day, now) : Number(named[3]);
      return isoDate(year, month, day);
    }
  }

  const numeric = /(?:avail(?:able)?\.?|move[-\s]?in)\b[^\n]{0,20}?\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/i.exec(text);
  if (numeric !== null) {
    const month = Number(numeric[1]);
    const day = Number(numeric[2]);
    if (month >= 1 && month <= 12) {
      let year: number;
      if (numeric[3] === undefined) {
        year = inferYear(month, day, now);
      } else {
        const raw = Number(numeric[3]);
        year = raw < 100 ? 2000 + raw : raw;
      }
      return isoDate(year, month, day);
    }
  }

  return null;
}

const WORD_NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, six: 6, nine: 9, twelve: 12 };

export function extractLeaseMonths(text: string): number | null {
  if (/month[-\s]to[-\s]month|\bmtm\b/i.test(text)) return 1;

  const years = /\b(one|two|three|\d{1,2})[-\s]?year(?:s)?(?:[-\s]lease| lease| term)?/i.exec(text);
  const months = /\b(one|two|three|four|six|nine|twelve|\d{1,2})[-\s]?(?:month|mo\.?)(?:s)?\b/i.exec(text);

  if (months !== null) {
    const token = months[1]!.toLowerCase();
    const value = WORD_NUMBERS[token] ?? Number(token);
    if (Number.isFinite(value) && value > 0 && value <= 60) return value;
  }
  if (years !== null) {
    const token = years[1]!.toLowerCase();
    const value = WORD_NUMBERS[token] ?? Number(token);
    if (Number.isFinite(value) && value > 0 && value <= 5) return value * 12;
  }
  if (/\b(?:annual|yearly) lease\b|\bone year lease\b/i.test(text)) return 12;
  return null;
}

function titleCaseWord(word: string): string {
  if (word.length === 0) return word;
  return word[0]!.toUpperCase() + word.slice(1).toLowerCase();
}

/** Display form: consistent capitalization and standard suffix abbreviations. */
export function cleanAddress(raw: string | null): string | null {
  if (raw === null) return null;
  const collapsed = raw.replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").replace(/^[,\s]+|[,\s]+$/g, "");
  if (collapsed === "") return null;
  return collapsed
    .split(" ")
    .map((token) => {
      const bare = token.replace(/[.,]/g, "").toLowerCase();
      const trailing = token.endsWith(",") ? "," : "";
      if (/^\d+$/.test(bare)) return token.replace(/\./g, "");
      if (STATES.has(bare) && !(bare in DIRECTIONS)) return bare.toUpperCase() + trailing;
      if (bare in DIRECTIONS) return DIRECTIONS[bare]!.toUpperCase() + trailing;
      if (bare in SUFFIXES) return titleCaseWord(SUFFIXES[bare]!) + trailing;
      return titleCaseWord(bare) + trailing;
    })
    .join(" ");
}

/**
 * Dedupe key: street number, street name, and unit only. City, state, and zip are dropped because
 * one source writes them and the next does not, and the unit number is what separates two leases
 * in one building.
 */
export function addressKey(raw: string | null): string | null {
  if (raw === null) return null;
  const lower = raw.toLowerCase();
  const unitMatch = UNIT_PATTERN.exec(lower);
  const unit = unitMatch === null ? null : unitMatch[1]!.replace(/-/g, "");

  const street = (lower.split(",")[0] ?? "")
    .replace(UNIT_PATTERN, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token !== "")
    .map((token) => DIRECTIONS[token] ?? SUFFIXES[token] ?? token)
    .join(" ")
    .trim();

  if (street === "") return null;
  return unit === null ? street : `${street} apt ${unit}`;
}
