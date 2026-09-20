import type { Page, Route } from "@playwright/test";
import {
  CAMPUSES,
  DraftSchema,
  ListingViewSchema,
  NotificationSchema,
  PreferencesSchema,
  ProfileSchema,
  SettingsSchema,
  SourceStatusSchema,
  STAGES,
  StatsSchema,
  TemplateSchema,
  defaultPreferences,
  type CampusPreset,
  type Draft,
  type ListingView,
  type Notification,
  type Profile,
  type Settings,
  type SourceStatus,
  type Stage,
  type Template,
} from "@housing/shared";

/**
 * Every fixture is parsed through the shared schema before a test sees it. If the contract
 * moves, the suite fails here with the field name rather than somewhere in the UI.
 */

const NOW = Date.now();
const iso = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();

function homewoodCampus(): CampusPreset {
  const found = CAMPUSES.find((campus) => campus.id === "homewood");
  if (!found) throw new Error("The shared campus presets no longer include homewood");
  return found;
}

const homewood = homewoodCampus();

function profile(
  id: string,
  name: string,
  color: string,
  overrides: Parameters<typeof PreferencesSchema.parse>[0],
): Profile {
  const base = defaultPreferences(homewood.anchor);
  return ProfileSchema.parse({
    id,
    name,
    enabled: true,
    color,
    preferences: PreferencesSchema.parse({ ...base, ...(overrides as object) }),
    createdAt: iso(60 * 24 * 9),
    updatedAt: iso(60 * 5),
  });
}

export function makeProfiles(): Profile[] {
  const base = defaultPreferences(homewood.anchor);
  return [
    profile("prof_row6", "Row home for 6", "#1e4d3f", {
      ...base,
      group: { size: 6 },
      price: { ...base.price, maxPerPerson: 800, idealPerPerson: 650, maxTotal: 4800 },
      beds: { ...base.beds, min: 5 },
      propertyTypes: ["rowhome", "house"],
      location: { ...base.location, maxWalkMinutes: 15, idealWalkMinutes: 8 },
      amenities: { ...base.amenities, laundryInUnit: "prefer", dishwasher: "prefer" },
      exclusions: { ...base.exclusions, buildings: ["The Marylander"] },
      notify: { ...base.notify, topic: "housing-row6-secret", minScore: 55 },
    }),
    profile("prof_apt4", "Apartment for 4", "#3a6ba6", {
      ...base,
      group: { size: 4 },
      price: { ...base.price, maxPerPerson: 1100, idealPerPerson: 900 },
      beds: { ...base.beds, min: 3 },
      propertyTypes: ["apartment", "condo"],
      location: { ...base.location, maxWalkMinutes: 20, idealWalkMinutes: 10 },
      notify: { ...base.notify, topic: "housing-apt4-secret", minScore: 60 },
    }),
  ];
}

interface ListingSeed {
  id: string;
  title: string;
  address: string;
  price: number | null;
  priceMax?: number | null;
  priceBasis?: "unit" | "room";
  beds: number | null;
  bedsMax?: number | null;
  incomeRestricted?: boolean;
  seniorHousing?: boolean;
  baths: number | null;
  sqft: number | null;
  propertyType: "apartment" | "rowhome" | "house" | "condo" | "studio" | "room" | "unknown";
  lat: number;
  lon: number;
  firstSeenMinutes: number;
  photos: string[];
  sources: { sourceId: string; sourceListingId: string; url: string }[];
  score: number;
  walkMinutes: number;
  matched: boolean;
  rejectedBy: string[];
  stage: Stage;
  starred: boolean;
  hidden: boolean;
  scamSignals: string[];
  status: "active" | "gone";
  email: string | null;
  phone: string | null;
  formUrl: string | null;
  availableDate: string | null;
  priceHistory: { price: number; at: string }[];
  draftIds: string[];
  neighborhood: string;
  description: string;
}

const SEEDS: ListingSeed[] = [
  {
    id: "lst_calvert",
    title: "Renovated 6 bedroom row home steps from campus",
    address: "2914 N Calvert St",
    price: 3900,
    beds: 6,
    baths: 2.5,
    sqft: 2400,
    propertyType: "rowhome",
    lat: 39.3252,
    lon: -76.6156,
    firstSeenMinutes: 4,
    photos: ["https://example.test/photos/calvert-1.jpg", "https://example.test/photos/calvert-2.jpg"],
    sources: [
      { sourceId: "craigslist", sourceListingId: "cl-8811", url: "https://example.test/cl/8811" },
      { sourceId: "jhu-och", sourceListingId: "och-4410", url: "https://example.test/och/4410" },
    ],
    score: 91,
    walkMinutes: 11,
    matched: true,
    rejectedBy: [],
    stage: "new",
    starred: false,
    hidden: false,
    scamSignals: [],
    status: "active",
    email: "leasing@calvertrow.test",
    phone: "(410) 555-0134",
    formUrl: null,
    availableDate: "2027-06-01",
    priceHistory: [
      { price: 4100, at: iso(60 * 24 * 12) },
      { price: 3900, at: iso(60 * 24 * 2) },
    ],
    draftIds: ["draft_calvert"],
    neighborhood: "Charles Village",
    description:
      "Six bedrooms over three floors, new kitchen, washer and dryer on the second floor. Front porch and a small yard. Available for a June start.",
  },
  {
    id: "lst_guilford",
    title: "Five bedroom house with parking",
    address: "3111 Guilford Ave",
    price: 4200,
    beds: 5,
    baths: 2,
    sqft: 2100,
    propertyType: "house",
    lat: 39.3221,
    lon: -76.6119,
    firstSeenMinutes: 52,
    photos: ["https://example.test/photos/guilford-1.jpg"],
    sources: [
      { sourceId: "redfin", sourceListingId: "rf-9921", url: "https://example.test/rf/9921" },
    ],
    score: 74,
    walkMinutes: 14,
    matched: true,
    rejectedBy: [],
    stage: "interested",
    starred: true,
    hidden: false,
    scamSignals: [],
    status: "active",
    email: null,
    phone: null,
    formUrl: "https://example.test/rf/9921/contact",
    availableDate: "2027-07-01",
    priceHistory: [],
    draftIds: ["draft_guilford"],
    neighborhood: "Charles Village",
    description: "Five bedrooms, off street parking for two cars, fenced yard.",
  },
  {
    id: "lst_abell",
    title: "Sunny 3 bedroom apartment",
    address: "420 E 32nd St",
    price: 2450,
    beds: 3,
    baths: 1,
    sqft: 1150,
    propertyType: "apartment",
    lat: 39.3269,
    lon: -76.6091,
    firstSeenMinutes: 190,
    photos: ["https://example.test/photos/abell-1.jpg"],
    sources: [
      { sourceId: "zumper", sourceListingId: "zu-2201", url: "https://example.test/zu/2201" },
    ],
    score: 62,
    walkMinutes: 9,
    matched: true,
    rejectedBy: [],
    stage: "contacted",
    starred: false,
    hidden: false,
    scamSignals: [],
    status: "active",
    email: "rentals@abellflats.test",
    phone: null,
    formUrl: null,
    availableDate: "2027-06-15",
    priceHistory: [],
    draftIds: ["draft_abell"],
    neighborhood: "Abell",
    description: "Third floor walk up with a bay window and original floors.",
  },
  {
    id: "lst_remington",
    title: "Four bedroom near the Avenue",
    address: "2708 Huntingdon Ave",
    price: 3100,
    beds: 4,
    baths: 1.5,
    sqft: null,
    propertyType: "rowhome",
    lat: 39.3244,
    lon: -76.6316,
    firstSeenMinutes: 1500,
    photos: [],
    sources: [
      { sourceId: "craigslist", sourceListingId: "cl-7714", url: "https://example.test/cl/7714" },
    ],
    score: 48,
    walkMinutes: 22,
    matched: true,
    rejectedBy: [],
    stage: "new",
    starred: false,
    hidden: false,
    scamSignals: [],
    status: "active",
    email: null,
    phone: "(443) 555-0199",
    formUrl: null,
    availableDate: null,
    priceHistory: [],
    draftIds: ["draft_remington"],
    neighborhood: "Remington",
    description: "Four bedrooms, close to Hampden. Text for a showing.",
  },
  {
    id: "lst_marylander",
    title: "Studio in The Marylander",
    address: "3501 St Paul St",
    price: 1450,
    beds: 0,
    baths: 1,
    sqft: 520,
    propertyType: "apartment",
    lat: 39.3289,
    lon: -76.6167,
    firstSeenMinutes: 700,
    photos: ["https://example.test/photos/marylander-1.jpg"],
    sources: [
      { sourceId: "rentcom", sourceListingId: "rc-101", url: "https://example.test/rc/101" },
    ],
    score: 21,
    walkMinutes: 6,
    matched: false,
    rejectedBy: ["bedsOutOfRange", "excludedBuilding"],
    stage: "new",
    starred: false,
    hidden: false,
    scamSignals: [],
    status: "active",
    email: "info@marylander.test",
    phone: null,
    formUrl: null,
    availableDate: "2027-05-01",
    priceHistory: [],
    draftIds: [],
    neighborhood: "Charles Village",
    description: "Studio apartment in a large managed building.",
  },
  {
    id: "lst_hopkins",
    title: "Row home, 5 bedrooms, price is per bedroom",
    address: "2818 N Calvert St, Baltimore, MD 21218",
    price: 850,
    priceBasis: "room",
    beds: 5,
    baths: 2,
    sqft: 2050,
    propertyType: "rowhome",
    lat: 39.3239,
    lon: -76.6151,
    firstSeenMinutes: 26,
    photos: ["https://example.test/photos/hopkins-1.jpg"],
    sources: [
      { sourceId: "jhu-och", sourceListingId: "och-3312", url: "https://example.test/och/3312" },
    ],
    score: 83,
    walkMinutes: 12,
    matched: true,
    rejectedBy: [],
    stage: "new",
    starred: false,
    hidden: false,
    scamSignals: [],
    status: "active",
    email: "rentals@calvertrow.test",
    phone: null,
    formUrl: null,
    availableDate: "2027-06-01",
    priceHistory: [],
    draftIds: [],
    neighborhood: "Charles Village",
    description: "Five bedrooms, two baths, porch and a yard. Each bedroom is leased separately.",
  },
  {
    id: "lst_wyman",
    title: "Wyman Park Flats, studios to four bedrooms",
    address: "3200 Wyman Park Dr",
    price: 1500,
    priceMax: 4200,
    beds: 0,
    bedsMax: 4,
    baths: 1,
    sqft: null,
    propertyType: "apartment",
    lat: 39.3284,
    lon: -76.6248,
    firstSeenMinutes: 240,
    photos: ["https://example.test/photos/wyman-1.jpg"],
    sources: [
      { sourceId: "rentcom", sourceListingId: "rc-770", url: "https://example.test/rc/770" },
    ],
    score: 68,
    walkMinutes: 13,
    matched: true,
    rejectedBy: [],
    stage: "new",
    starred: false,
    hidden: false,
    scamSignals: [],
    status: "active",
    email: "leasing@wymanparkflats.test",
    phone: null,
    formUrl: null,
    availableDate: "2027-06-01",
    priceHistory: [],
    draftIds: [],
    neighborhood: "Wyman Park",
    description: "Studios through four bedroom flats. Rent depends on the plan you pick.",
  },
  {
    id: "lst_barclay",
    title: "Three bedroom, income restricted",
    address: "2500 Barclay St",
    price: 1350,
    beds: 3,
    incomeRestricted: true,
    baths: 1,
    sqft: 1000,
    propertyType: "rowhome",
    lat: 39.3199,
    lon: -76.6122,
    firstSeenMinutes: 900,
    photos: [],
    sources: [
      { sourceId: "appfolio", sourceListingId: "af-5502", url: "https://example.test/af/5502" },
    ],
    score: 34,
    walkMinutes: 17,
    matched: false,
    rejectedBy: ["incomeRestricted", "bedsOutOfRange"],
    stage: "new",
    starred: false,
    hidden: false,
    scamSignals: [],
    status: "active",
    email: null,
    phone: "(410) 555-0177",
    formUrl: null,
    availableDate: "2027-05-15",
    priceHistory: [],
    draftIds: [],
    neighborhood: "Barclay",
    description: "Household income limits apply. Three bedrooms on two floors.",
  },
  {
    id: "lst_toogood",
    title: "6 BR house 900 total, must wire deposit today",
    address: "1800 Bolton St",
    price: 900,
    beds: 6,
    baths: 3,
    sqft: null,
    propertyType: "house",
    lat: 39.3061,
    lon: -76.6252,
    firstSeenMinutes: 2600,
    photos: [],
    sources: [
      { sourceId: "craigslist", sourceListingId: "cl-6610", url: "https://example.test/cl/6610" },
    ],
    score: 15,
    walkMinutes: 41,
    matched: false,
    rejectedBy: ["suspectedScam", "tooFar"],
    stage: "passed",
    starred: false,
    hidden: false,
    scamSignals: ["priceFarBelowArea", "wireOrGiftCardLanguage", "landlordOutOfCountry"],
    status: "gone",
    email: "owner@notreal.test",
    phone: null,
    formUrl: null,
    availableDate: null,
    priceHistory: [],
    draftIds: [],
    neighborhood: "Bolton Hill",
    description: "I am currently out of the country. Wire the deposit and I will mail the keys.",
  },
];

/** The engine prices a per-room listing by multiplying the room rate by the bedrooms. */
function unitTotal(seed: ListingSeed): number | null {
  if (seed.price === null) return null;
  if (seed.priceBasis !== "room") return seed.price;
  return seed.beds === null ? null : seed.price * seed.beds;
}

function toView(seed: ListingSeed, profiles: Profile[]): ListingView {
  const primary = profiles[0];
  const second = profiles[1];
  if (!primary || !second) throw new Error("Two fixture profiles are required");

  return ListingViewSchema.parse({
    listing: {
      id: seed.id,
      title: seed.title,
      description: seed.description,
      price: seed.price,
      priceMax: seed.priceMax ?? null,
      priceBasis: seed.priceBasis ?? "unit",
      beds: seed.beds,
      bedsMax: seed.bedsMax ?? null,
      baths: seed.baths,
      sqft: seed.sqft,
      propertyType: seed.propertyType,
      isSublet: false,
      incomeRestricted: seed.incomeRestricted ?? false,
      seniorHousing: seed.seniorHousing ?? false,
      address: seed.address,
      neighborhood: seed.neighborhood,
      zip: "21218",
      lat: seed.lat,
      lon: seed.lon,
      availableDate: seed.availableDate,
      leaseMonths: 12,
      photos: seed.photos,
      amenities: { laundryInUnit: true, dishwasher: seed.beds !== null && seed.beds > 3 },
      contact: {
        name: seed.email ? "Dana Reyes" : null,
        company: "Calvert Row Management",
        email: seed.email,
        phone: seed.phone,
        formUrl: seed.formUrl,
      },
      scamSignals: seed.scamSignals,
      sources: seed.sources,
      priceHistory: seed.priceHistory,
      status: seed.status,
      postedAt: iso(seed.firstSeenMinutes + 30),
      firstSeenAt: iso(seed.firstSeenMinutes),
      lastSeenAt: iso(Math.max(1, Math.round(seed.firstSeenMinutes / 4))),
    },
    state: {
      stage: seed.stage,
      starred: seed.starred,
      hidden: seed.hidden,
      notes: seed.id === "lst_guilford" ? "Called, left a message Tuesday." : "",
    },
    matches: [
      {
        listingId: seed.id,
        profileId: primary.id,
        matched: seed.matched,
        rejectedBy: seed.rejectedBy,
        score: seed.score,
        breakdown: {
          price: Math.min(100, seed.score + 6),
          distance: Math.max(0, 100 - seed.walkMinutes * 4),
          amenities: 55,
          size: 80,
          freshness: Math.max(20, 100 - seed.firstSeenMinutes / 20),
          keywordBoost: seed.score > 80 ? 4 : 0,
        },
        monthlyTotal: unitTotal(seed),
        pricePerPerson: unitTotal(seed) === null ? null : Math.round((unitTotal(seed) ?? 0) / 6),
        walkMinutes: seed.walkMinutes,
        distanceMiles: Math.round((seed.walkMinutes / 20) * 10) / 10,
      },
      {
        listingId: seed.id,
        profileId: second.id,
        matched: seed.beds !== null && seed.beds >= 3 && seed.beds <= 4,
        rejectedBy: seed.beds !== null && seed.beds >= 3 && seed.beds <= 4 ? [] : ["bedsOutOfRange"],
        score: Math.max(5, seed.score - 18),
        breakdown: {
          price: 60,
          distance: Math.max(0, 100 - seed.walkMinutes * 3),
          amenities: 50,
          size: 70,
          freshness: 60,
          keywordBoost: 0,
        },
        monthlyTotal: unitTotal(seed),
        pricePerPerson: unitTotal(seed) === null ? null : Math.round((unitTotal(seed) ?? 0) / 4),
        walkMinutes: seed.walkMinutes,
        distanceMiles: Math.round((seed.walkMinutes / 20) * 10) / 10,
      },
    ],
    draftIds: seed.draftIds,
  });
}

export function makeListings(profiles: Profile[]): ListingView[] {
  return SEEDS.map((seed) => toView(seed, profiles));
}

export function makeDrafts(): Draft[] {
  return [
    DraftSchema.parse({
      id: "draft_calvert",
      listingId: "lst_calvert",
      profileId: "prof_row6",
      channel: "email",
      to: "leasing@calvertrow.test",
      subject: "Interested in 2914 N Calvert St",
      body:
        "Hello Dana,\n\nI saw your listing at 2914 N Calvert St. We are six juniors at Hopkins with guarantors, looking for a June start on a twelve month lease.\n\nIs it still available, and could we see it this week?\n\nSam Rivera\nJohns Hopkins University, Class of 2028\n",
      status: "staged",
      generatedBy: "template",
      error: null,
      createdAt: iso(3),
      sentAt: null,
    }),
    DraftSchema.parse({
      id: "draft_guilford",
      listingId: "lst_guilford",
      profileId: "prof_row6",
      channel: "form",
      to: null,
      subject: "Interested in 3111 Guilford Ave",
      body: "Hello, is 3111 Guilford Ave still available for a July start?",
      status: "staged",
      generatedBy: "llm",
      error: null,
      createdAt: iso(50),
      sentAt: null,
    }),
    DraftSchema.parse({
      id: "draft_remington",
      listingId: "lst_remington",
      profileId: "prof_row6",
      channel: "sms",
      to: null,
      subject: "2708 Huntingdon Ave",
      body: "Hi, is 2708 Huntingdon Ave still available? Six of us are looking for June.",
      status: "staged",
      generatedBy: "template",
      error: null,
      createdAt: iso(1400),
      sentAt: null,
    }),
    DraftSchema.parse({
      id: "draft_abell",
      listingId: "lst_abell",
      profileId: "prof_row6",
      channel: "email",
      to: "rentals@abellflats.test",
      subject: "Interested in 420 E 32nd St",
      body: "Hello, is 420 E 32nd St still available?",
      status: "sent",
      generatedBy: "template",
      error: null,
      createdAt: iso(180),
      sentAt: iso(170),
    }),
  ];
}

export function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return SettingsSchema.parse({
    setupComplete: true,
    campusId: "homewood",
    identity: {
      fullName: "Sam Rivera",
      email: "srivera@example.edu",
      phone: "(410) 555-0180",
      school: "Johns Hopkins University, Class of 2028",
      blurb: "Six juniors at Hopkins, no pets, all with guarantors.",
    },
    composeVia: "outlook",
    ntfyServer: "https://ntfy.sh",
    dashboardUrl: "http://localhost:4747",
    smtpConfigured: false,
    llmConfigured: true,
    ntfyCommandTopicConfigured: true,
    ...overrides,
  });
}

export function makeSources(): SourceStatus[] {
  return [
    SourceStatusSchema.parse({
      id: "craigslist",
      name: "Craigslist",
      kind: "http",
      homepage: "https://baltimore.craigslist.org",
      enabled: true,
      intervalSec: 300,
      needsSetup: false,
      setupHint: null,
      config: {},
      lastRunAt: iso(3),
      lastSuccessAt: iso(3),
      lastError: null,
      consecutiveFailures: 0,
      lastRunCount: 12,
      totalListings: 418,
    }),
    SourceStatusSchema.parse({
      id: "redfin",
      name: "Redfin rentals",
      kind: "http",
      homepage: "https://www.redfin.com",
      enabled: true,
      intervalSec: 900,
      needsSetup: false,
      setupHint: null,
      config: { headless: true },
      lastRunAt: iso(7),
      lastSuccessAt: iso(64),
      lastError: "Request blocked: captcha page returned for search URL",
      consecutiveFailures: 3,
      lastRunCount: 0,
      totalListings: 96,
    }),
    SourceStatusSchema.parse({
      id: "zumper",
      name: "Zumper",
      kind: "browser",
      homepage: "https://www.zumper.com",
      enabled: true,
      intervalSec: 600,
      needsSetup: false,
      setupHint: null,
      config: {},
      lastRunAt: iso(9),
      lastSuccessAt: iso(9),
      lastError: null,
      consecutiveFailures: 0,
      lastRunCount: 4,
      totalListings: 131,
    }),
    SourceStatusSchema.parse({
      id: "rentcom",
      name: "Rent.com",
      kind: "http",
      homepage: "https://www.rent.com",
      enabled: true,
      intervalSec: 1200,
      needsSetup: false,
      setupHint: null,
      config: {},
      lastRunAt: iso(20),
      lastSuccessAt: iso(20),
      lastError: null,
      consecutiveFailures: 0,
      lastRunCount: 2,
      totalListings: 58,
    }),
    SourceStatusSchema.parse({
      id: "jhu-och",
      name: "JHU Off-Campus Housing",
      kind: "http",
      homepage: "https://offcampushousing.jhu.edu",
      enabled: true,
      intervalSec: 300,
      needsSetup: false,
      setupHint: null,
      config: {},
      lastRunAt: iso(5),
      lastSuccessAt: iso(5),
      lastError: null,
      consecutiveFailures: 0,
      lastRunCount: 3,
      totalListings: 77,
    }),
    SourceStatusSchema.parse({
      id: "appfolio",
      name: "AppFolio landlords",
      kind: "http",
      homepage: "https://www.appfolio.com",
      enabled: true,
      intervalSec: 1800,
      needsSetup: true,
      setupHint:
        "Add the landlord subdomains you want watched, one per line. Look at a listing page URL: americanmanagement.appfolio.com means the subdomain is americanmanagement.",
      config: { subdomains: [] },
      lastRunAt: null,
      lastSuccessAt: null,
      lastError: null,
      consecutiveFailures: 0,
      lastRunCount: 0,
      totalListings: 0,
    }),
    SourceStatusSchema.parse({
      id: "facebook-marketplace",
      name: "Facebook Marketplace",
      kind: "account",
      homepage: "https://www.facebook.com/marketplace",
      enabled: false,
      intervalSec: 1800,
      needsSetup: true,
      setupHint:
        "Run pnpm --filter @housing/server login:facebook in a terminal. A browser opens, you log in once, and the session is stored under data/.",
      config: {},
      lastRunAt: null,
      lastSuccessAt: null,
      lastError: null,
      consecutiveFailures: 0,
      lastRunCount: 0,
      totalListings: 0,
    }),
  ];
}

export function makeNotifications(): Notification[] {
  return [
    NotificationSchema.parse({
      id: "ntf_1",
      kind: "match",
      title: "$3,900 6 bd 2914 N Calvert St",
      body: "Score 91, $650 each, 11 min walk, available Jun 1, craigslist",
      listingId: "lst_calvert",
      profileId: "prof_row6",
      pushed: true,
      createdAt: iso(4),
      readAt: null,
    }),
    NotificationSchema.parse({
      id: "ntf_2",
      kind: "priceDrop",
      title: "Price dropped at 2914 N Calvert St",
      body: "Down $200 to $3,900",
      listingId: "lst_calvert",
      profileId: "prof_row6",
      pushed: true,
      createdAt: iso(2880),
      readAt: null,
    }),
    NotificationSchema.parse({
      id: "ntf_3",
      kind: "sourceDown",
      title: "Redfin rentals is failing",
      body: "Three runs in a row returned a captcha page",
      listingId: null,
      profileId: "prof_row6",
      pushed: false,
      createdAt: iso(60),
      readAt: iso(50),
    }),
  ];
}

export function makeTemplates(): Template[] {
  return [
    TemplateSchema.parse({
      id: "tpl_first",
      name: "First contact",
      subject: "Interested in {{listing.address}}",
      body:
        "Hello {{contact.name}},\n\nI saw your listing at {{listing.address}}. {{me.blurb}}\n\nIs it still available?\n\n{{me.fullName}}\n{{me.school}}\n",
    }),
  ];
}

export interface FakeState {
  settings: Settings;
  profiles: Profile[];
  listings: ListingView[];
  drafts: Draft[];
  sources: SourceStatus[];
  notifications: Notification[];
  templates: Template[];
}

export function makeState(settingsOverrides: Partial<Settings> = {}): FakeState {
  const profiles = makeProfiles();
  return {
    settings: makeSettings(settingsOverrides),
    profiles,
    listings: makeListings(profiles),
    drafts: makeDrafts(),
    sources: makeSources(),
    notifications: makeNotifications(),
    templates: makeTemplates(),
  };
}

function stats(state: FakeState) {
  // z.record(StageSchema, ...) is exhaustive in Zod 4, so every stage needs a key.
  const byStage: Record<string, number> = Object.fromEntries(STAGES.map((stage) => [stage, 0]));
  for (const view of state.listings) {
    byStage[view.state.stage] = (byStage[view.state.stage] ?? 0) + 1;
  }
  return StatsSchema.parse({
    activeListings: state.listings.filter((v) => v.listing.status === "active").length,
    matchedListings: state.listings.filter((v) => v.matches.some((m) => m.matched)).length,
    newLast24h: 3,
    stagedDrafts: state.drafts.filter((d) => d.status === "staged").length,
    unreadNotifications: state.notifications.filter((n) => n.readAt === null).length,
    sourcesDown: state.sources.filter((s) => s.consecutiveFailures >= 3).length,
    byStage,
  });
}

function sortListings(items: ListingView[], sort: string, profileId: string | null): ListingView[] {
  const match = (view: ListingView) =>
    view.matches.find((m) => m.profileId === profileId) ?? view.matches[0];
  const copy = [...items];
  switch (sort) {
    case "score":
      return copy.sort((a, b) => (match(b)?.score ?? 0) - (match(a)?.score ?? 0));
    case "priceAsc":
      return copy.sort((a, b) => (a.listing.price ?? 1e9) - (b.listing.price ?? 1e9));
    case "priceDesc":
      return copy.sort((a, b) => (b.listing.price ?? -1) - (a.listing.price ?? -1));
    case "distance":
      return copy.sort((a, b) => (match(a)?.walkMinutes ?? 1e9) - (match(b)?.walkMinutes ?? 1e9));
    default:
      return copy.sort(
        (a, b) => Date.parse(b.listing.firstSeenAt) - Date.parse(a.listing.firstSeenAt),
      );
  }
}

function queryListings(state: FakeState, params: URLSearchParams) {
  const profileId = params.get("profileId");
  const scope = params.get("scope") ?? "matched";
  const stage = params.get("stage");
  const starred = params.get("starred") === "true";
  const includeHidden = params.get("includeHidden") === "true";
  const includeGone = params.get("includeGone") === "true";
  const sourceId = params.get("sourceId");
  const text = (params.get("q") ?? "").toLowerCase();
  const limit = Number(params.get("limit") ?? 50);

  let items = state.listings.filter((view) => {
    const match = view.matches.find((m) => m.profileId === profileId) ?? view.matches[0];
    if (scope === "matched" && !(match?.matched ?? false)) return false;
    if (!includeHidden && view.state.hidden) return false;
    if (!includeGone && view.listing.status === "gone") return false;
    if (stage && view.state.stage !== stage) return false;
    if (starred && !view.state.starred) return false;
    if (sourceId && !view.listing.sources.some((s) => s.sourceId === sourceId)) return false;
    if (text) {
      const hay =
        `${view.listing.title} ${view.listing.address ?? ""} ${view.listing.description ?? ""}`.toLowerCase();
      if (!hay.includes(text)) return false;
    }
    return true;
  });

  items = sortListings(items, params.get("sort") ?? "newest", profileId);
  return { items: items.slice(0, limit), total: items.length };
}

/** Enough of the profile preview to prove the editor is asking and rendering the answer. */
function preview(body: Record<string, unknown>, state: FakeState) {
  const prefs = PreferencesSchema.safeParse(
    (body as { preferences?: unknown }).preferences ?? {},
  );
  const cap = prefs.success ? (prefs.data.price.maxPerPerson ?? 2000) : 2000;
  const size = prefs.success ? prefs.data.group.size : 1;
  const matched = state.listings.filter(
    (view) => view.listing.price !== null && view.listing.price / size <= cap,
  ).length;
  const overBudget = Math.max(0, state.listings.length - matched);
  return {
    matched,
    total: state.listings.length,
    topRejectReasons: [
      ...(overBudget > 0 ? [["priceOverMax", overBudget]] : []),
      ["tooFar", 2],
    ],
  };
}

const SSE_BODY = "retry: 86400000\n\n: connected\n\n";

/**
 * Installs an in-memory server on the page's HTTP boundary. Nothing in the app knows it
 * is talking to a fake, so the tests exercise the real fetch, schema parsing and cache.
 */
export async function mockApi(page: Page, state: FakeState): Promise<FakeState> {
  await page.route("**/api/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, "");
    const method = request.method();
    const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;

    const json = (payload: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(payload),
      });
    const noContent = () => route.fulfill({ status: 204, body: "" });
    const fail = (message: string, status = 400) => json({ error: message }, status);

    if (path === "/events") {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
        body: SSE_BODY,
      });
      return;
    }

    if (path === "/health") return json({ ok: true, version: "0.1.0-test" });
    if (path === "/stats") return json(stats(state));
    if (path === "/campuses") return json(CAMPUSES);
    if (path === "/templates" && method === "GET") return json(state.templates);

    if (path === "/settings") {
      if (method === "PATCH") {
        state.settings = SettingsSchema.parse({ ...state.settings, ...body });
      }
      return json(state.settings);
    }

    if (path === "/profiles" && method === "GET") return json(state.profiles);

    if (path === "/profiles/preview" && method === "POST") return json(preview(body, state));

    if (path === "/profiles" && method === "POST") {
      const created = ProfileSchema.parse({
        id: `prof_${state.profiles.length + 1}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...body,
      });
      state.profiles = [...state.profiles, created];
      return json(created);
    }

    const profileMatch = /^\/profiles\/([^/]+)$/.exec(path);
    if (profileMatch?.[1]) {
      const id = profileMatch[1];
      if (method === "DELETE") {
        state.profiles = state.profiles.filter((p) => p.id !== id);
        return noContent();
      }
      const updated = ProfileSchema.parse({
        id,
        createdAt: state.profiles.find((p) => p.id === id)?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...body,
      });
      state.profiles = state.profiles.map((p) => (p.id === id ? updated : p));
      return json(updated);
    }

    if (path === "/listings" && method === "GET") return json(queryListings(state, url.searchParams));

    const stateMatch = /^\/listings\/([^/]+)\/state$/.exec(path);
    if (stateMatch?.[1] && method === "PATCH") {
      const id = stateMatch[1];
      const found = state.listings.find((v) => v.listing.id === id);
      if (!found) return fail("No such listing", 404);
      const next = ListingViewSchema.parse({ ...found, state: { ...found.state, ...body } });
      state.listings = state.listings.map((v) => (v.listing.id === id ? next : v));
      return json(next);
    }

    const draftsForListing = /^\/listings\/([^/]+)\/drafts$/.exec(path);
    if (draftsForListing?.[1] && method === "POST") {
      const listingId = draftsForListing[1];
      const existing = state.drafts.find((d) => d.listingId === listingId);
      const created = DraftSchema.parse({
        id: existing?.id ?? `draft_${state.drafts.length + 1}`,
        listingId,
        profileId: String(body.profileId ?? "prof_row6"),
        channel: existing?.channel ?? "email",
        to: existing?.to ?? "leasing@calvertrow.test",
        subject: existing?.subject ?? "Interested in your listing",
        body: "Rewritten draft. Six juniors at Hopkins, guarantors ready, June start.",
        status: "staged",
        generatedBy: "llm",
        error: null,
        createdAt: new Date().toISOString(),
        sentAt: null,
      });
      state.drafts = [created, ...state.drafts.filter((d) => d.id !== created.id)];
      return json(created);
    }

    const listingMatch = /^\/listings\/([^/]+)$/.exec(path);
    if (listingMatch?.[1] && method === "GET") {
      const found = state.listings.find((v) => v.listing.id === listingMatch[1]);
      return found ? json(found) : fail("No such listing", 404);
    }

    if (path === "/drafts" && method === "GET") {
      const status = url.searchParams.get("status");
      const items = status ? state.drafts.filter((d) => d.status === status) : state.drafts;
      return json(items);
    }

    const draftAction = /^\/drafts\/([^/]+)\/(send|mark-sent)$/.exec(path);
    if (draftAction?.[1] && draftAction[2] && method === "POST") {
      const id = draftAction[1];
      const found = state.drafts.find((d) => d.id === id);
      if (!found) return fail("No such draft", 404);
      if (draftAction[2] === "send" && !state.settings.smtpConfigured) {
        return fail("SMTP is not configured on this server", 409);
      }
      const sent = DraftSchema.parse({
        ...found,
        status: "sent",
        sentAt: new Date().toISOString(),
      });
      state.drafts = state.drafts.map((d) => (d.id === id ? sent : d));
      state.listings = state.listings.map((v) =>
        v.listing.id === sent.listingId
          ? ListingViewSchema.parse({ ...v, state: { ...v.state, stage: "contacted" } })
          : v,
      );
      return json(sent);
    }

    const draftMatch = /^\/drafts\/([^/]+)$/.exec(path);
    if (draftMatch?.[1]) {
      const id = draftMatch[1];
      const found = state.drafts.find((d) => d.id === id);
      if (!found) return fail("No such draft", 404);
      if (method === "DELETE") {
        state.drafts = state.drafts.map((d) =>
          d.id === id ? DraftSchema.parse({ ...d, status: "discarded" }) : d,
        );
        return noContent();
      }
      if (method === "PATCH") {
        const next = DraftSchema.parse({ ...found, ...body });
        state.drafts = state.drafts.map((d) => (d.id === id ? next : d));
        return json(next);
      }
      return json(found);
    }

    if (path === "/notifications" && method === "GET") {
      const unread = url.searchParams.get("unread") === "true";
      return json(unread ? state.notifications.filter((n) => n.readAt === null) : state.notifications);
    }

    if (path === "/notifications/read" && method === "POST") {
      const ids = Array.isArray(body.ids) ? body.ids.map(String) : null;
      state.notifications = state.notifications.map((n) =>
        ids === null || ids.includes(n.id)
          ? NotificationSchema.parse({ ...n, readAt: new Date().toISOString() })
          : n,
      );
      return noContent();
    }

    if (path === "/sources" && method === "GET") return json(state.sources);

    const sourceRun = /^\/sources\/([^/]+)\/run$/.exec(path);
    if (sourceRun?.[1] && method === "POST") {
      const id = sourceRun[1];
      const found = state.sources.find((s) => s.id === id);
      if (!found) return fail("No such source", 404);
      const ran = SourceStatusSchema.parse({
        ...found,
        lastRunAt: new Date().toISOString(),
        lastSuccessAt: new Date().toISOString(),
        lastError: null,
        consecutiveFailures: 0,
        lastRunCount: 7,
        totalListings: found.totalListings + 7,
      });
      state.sources = state.sources.map((s) => (s.id === id ? ran : s));
      return json(ran);
    }

    const sourceMatch = /^\/sources\/([^/]+)$/.exec(path);
    if (sourceMatch?.[1] && method === "PATCH") {
      const id = sourceMatch[1];
      const found = state.sources.find((s) => s.id === id);
      if (!found) return fail("No such source", 404);
      const next = SourceStatusSchema.parse({
        ...found,
        ...body,
        needsSetup:
          id === "appfolio"
            ? ((body.config as { subdomains?: unknown[] } | undefined)?.subdomains ?? []).length ===
              0
            : found.needsSetup,
      });
      state.sources = state.sources.map((s) => (s.id === id ? next : s));
      return json(next);
    }

    if (path === "/test/ntfy" && method === "POST") return json({ ok: true });
    if (path === "/test/smtp" && method === "POST")
      return json({ ok: false, error: "SMTP_HOST is not set" });

    const templateMatch = /^\/templates\/([^/]+)$/.exec(path);
    if (path === "/templates" && method === "POST") {
      const created = TemplateSchema.parse({ id: `tpl_${state.templates.length + 1}`, ...body });
      state.templates = [...state.templates, created];
      return json(created);
    }
    if (templateMatch?.[1]) {
      const id = templateMatch[1];
      if (method === "DELETE") {
        state.templates = state.templates.filter((t) => t.id !== id);
        return noContent();
      }
      const next = TemplateSchema.parse({ id, ...body });
      state.templates = state.templates.map((t) => (t.id === id ? next : t));
      return json(next);
    }

    return fail(`The fixture server has no route for ${method} ${path}`, 404);
  });

  // Listing photos point at example.test, which does not resolve. Serve a pixel so the
  // layout is measured with real images in place.
  await page.route("**/photos/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="#c9cfc6"/><rect x="40" y="90" width="240" height="150" fill="#a8b0a5"/><rect x="120" y="140" width="40" height="100" fill="#8c958a"/></svg>',
    }),
  );

  return state;
}
