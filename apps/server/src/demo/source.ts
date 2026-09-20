import type { RawListingInput } from "@housing/shared";
import type { SourceAdapter } from "@housing/sources";

// A stand-in for a real site so the dashboard, the pushes, and the e2e run have something to chew
// on without touching anyone's servers. Everything here is deterministic apart from the clock.

const ANCHOR = { lat: 39.3299, lon: -76.6205 };
const NEW_LISTING_EVERY_MS = 20_000;
const MAX_TRICKLE = 25;
/** The demo listing that is taken off the market once the watcher has seen it twice. */
const DISAPPEARS_AT_RUN = 2;
/** The demo listing whose price falls once the watcher has seen it twice. */
const DROPS_AT_RUN = 2;

const ADDRESSES = [
  "3210 Guilford Ave",
  "2916 N Calvert St",
  "125 W 27th St",
  "3001 St Paul St",
  "412 E 31st St",
  "2700 Maryland Ave",
  "3300 N Charles St",
  "800 W 36th St",
  "3712 Chestnut Ave",
  "2620 Huntingdon Ave",
  "115 W University Pkwy",
  "3100 Abell Ave",
  "417 E 33rd St",
  "2800 N Calvert St",
  "3501 St Paul St",
  "9 E 33rd St",
  "3201 Greenmount Ave",
  "2900 Barclay St",
  "240 W 29th St",
  "3915 Beech Ave",
  "1300 W 36th St",
  "701 Homestead St",
  "3025 Guilford Ave",
  "2437 N Charles St",
  "4 E 31st St",
];

const NEIGHBORHOODS = ["Charles Village", "Remington", "Hampden", "Waverly", "Abell", "Oakenshawe"];

const AMENITY_LINES = [
  "Washer and dryer in unit, dishwasher, central air.",
  "Laundry room on site, window units, street parking.",
  "Hardwood floors, back yard, cats ok.",
  "Renovated kitchen with dishwasher, off street parking, pet friendly.",
  "Utilities included, ceiling fans, front porch.",
  "In-unit laundry, patio, dogs allowed, off street parking.",
];

const LEASE_LINES = [
  "12 month lease.",
  "Available 6/1 for a 12-month lease.",
  "Two year lease preferred.",
  "9 month lease for the school year.",
  "Available June 1.",
  "Avail 8/1/2027.",
];

/** Small deterministic PRNG so every boot of the demo produces the same inventory. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: T[], random: number): T {
  const index = Math.min(items.length - 1, Math.floor(random * items.length));
  return items[index]!;
}

function contactFor(index: number): RawListingInput["contact"] {
  // Rotates through the three shapes the outreach code has to handle.
  if (index % 3 === 0) {
    return {
      name: `Dana Reyes ${index}`,
      company: "Charles Village Rentals",
      email: `leasing+${index}@example.com`,
    };
  }
  if (index % 3 === 1) {
    return { name: `Pat Mercer ${index}`, company: null, phone: `(410) 555-${String(1000 + index).slice(-4)}` };
  }
  return { name: null, company: "Homewood Property Group", formUrl: `https://example.com/inquire/${index}` };
}

function buildListing(index: number, sourceId: string, runCount: number): RawListingInput {
  const random = mulberry32(index * 7919 + 13);
  const address = ADDRESSES[index % ADDRESSES.length]!;
  const beds = 1 + (index % 7);
  const rowhome = index % 3 !== 1;
  const basePrice = 700 + beds * 420 + Math.floor(random() * 300);
  const dropped = index === 4 && runCount >= DROPS_AT_RUN;

  const scam = index === 7;
  const description = scam
    ? [
        "Beautiful renovated home near campus at an unbeatable price.",
        "I am currently out of the country on a mission trip so I cannot show the unit in person.",
        "Send the deposit by wire transfer or gift cards and I will ship the keys to you.",
      ].join(" ")
    : [
        `Bright ${beds} bedroom ${rowhome ? "row home" : "apartment"} a short walk from Homewood.`,
        pick(AMENITY_LINES, random()),
        pick(LEASE_LINES, random()),
        index % 4 === 0 ? "Email leasing for a tour." : "Call or text to schedule a showing.",
      ].join(" ");

  return {
    sourceId,
    sourceListingId: `unit-${index}`,
    url: `https://example.com/${sourceId}/unit-${index}`,
    title: `${beds} BR ${rowhome ? "row home" : "apartment"} on ${address.replace(/^\d+\s+/, "")}`,
    description,
    price: dropped ? basePrice - 250 : basePrice,
    beds,
    baths: 1 + (index % 3) * 0.5,
    sqft: 600 + beds * 210,
    propertyType: rowhome ? "rowhome" : "apartment",
    address: `${address}, Baltimore, MD 21218`,
    neighborhood: pick(NEIGHBORHOODS, random()),
    zip: "21218",
    lat: ANCHOR.lat + (random() - 0.5) * 0.02,
    lon: ANCHOR.lon + (random() - 0.5) * 0.024,
    photos: scam ? [] : [`https://picsum.photos/seed/housing-${index}/800/600`],
    contact: contactFor(index),
  };
}

function trickleListing(index: number, sourceId: string): RawListingInput {
  const base = buildListing(100 + index, sourceId, 0);
  return {
    ...base,
    sourceListingId: `fresh-${index}`,
    url: `https://example.com/${sourceId}/fresh-${index}`,
    title: `Just listed: ${base.title}`,
    postedAt: new Date().toISOString(),
  };
}

interface DemoState {
  startedAt: number;
  runs: Map<string, number>;
}

function createState(): DemoState {
  return { startedAt: Date.now(), runs: new Map() };
}

const state = createState();

function nextRun(sourceId: string): number {
  const count = (state.runs.get(sourceId) ?? 0) + 1;
  state.runs.set(sourceId, count);
  return count;
}

const PRIMARY_ID = "demo";
const PARTNER_ID = "demo-partner";

function primarySearch(): RawListingInput[] {
  const runCount = nextRun(PRIMARY_ID);
  const listings: RawListingInput[] = [];

  for (let index = 0; index < ADDRESSES.length; index += 1) {
    // One unit leaves the market so the missed-run counter has something to count.
    if (index === 11 && runCount > DISAPPEARS_AT_RUN) continue;
    listings.push(buildListing(index, PRIMARY_ID, runCount));
  }

  const trickle = Math.min(MAX_TRICKLE, Math.floor((Date.now() - state.startedAt) / NEW_LISTING_EVERY_MS));
  for (let index = 0; index < trickle; index += 1) {
    listings.push(trickleListing(index, PRIMARY_ID));
  }

  return listings;
}

/** Posts the same physical unit as the primary source, which is what exercises dedupe. */
function partnerSearch(): RawListingInput[] {
  nextRun(PARTNER_ID);
  const shared = buildListing(3, PARTNER_ID, 0);
  return [
    {
      ...shared,
      sourceListingId: "partner-3",
      url: `https://example.com/${PARTNER_ID}/partner-3`,
      title: `${shared.title} (partner listing)`,
    },
  ];
}

export const demoAdapters: SourceAdapter[] = [
  {
    id: PRIMARY_ID,
    name: "Demo listings",
    kind: "http",
    homepage: "https://example.com/demo",
    defaultIntervalSec: 20,
    defaultEnabled: true,
    defaultConfig: {},
    needsSetup: async () => null,
    search: async () => primarySearch(),
  },
  {
    id: PARTNER_ID,
    name: "Demo partner listings",
    kind: "http",
    homepage: "https://example.com/demo-partner",
    defaultIntervalSec: 20,
    defaultEnabled: true,
    defaultConfig: {},
    needsSetup: async () => null,
    search: async () => partnerSearch(),
  },
];
