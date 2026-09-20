import type { RawListingInput } from "@housing/shared";
import * as cheerio from "cheerio";
import { collapseWhitespace, parseMoney, propertyTypeFrom } from "../text.ts";
import type { BrowserPage, SourceAdapter, SourceContext } from "../types.ts";
import { FACEBOOK_PROFILE, isLoggedIn } from "./facebook-marketplace.ts";

const SOURCE_ID = "facebook-groups";
const ORIGIN = "https://www.facebook.com";
const MAX_GROUPS_PER_RUN = 3;

/**
 * WARNING. Automated access to Facebook can get an account restricted or disabled. Turning
 * this source on means accepting that risk for the account logged into the persistent
 * browser profile named "facebook". The adapter is off by default for that reason.
 *
 * UNVERIFIED AGAINST LIVE MARKUP. Group feeds are members only and this adapter was written
 * without an account, so the parser was built against the stable hooks Facebook exposes to
 * assistive technology (article roles, the permalink URL shape, the post time link) and
 * tested against a hand-built fixture. Treat the first live run as the real test.
 *
 * The adapter only reads. It never joins a group, never answers a membership question, never
 * posts, comments, reacts, or messages. It reads groups the user already belongs to, three
 * per run in rotation, one page load each.
 */

/** Wording that means the poster wants housing rather than offers it. */
const SEEKING_PATTERNS = [
  /\bISO\b/,
  /\bin search of\b/i,
  /\blooking for (a |an )?(room|house|apartment|apt|place|housing|sublet|roommate)/i,
  /\bseeking (a |an )?(room|house|apartment|apt|place|housing|sublet)/i,
  /\bwanted\b\s*[:!-]/i,
  /\banyone (have|know of)\b.{0,40}\b(room|place|apartment|house)/i,
  /\bneed (a |an )?(room|place|apartment|sublet)\b/i,
];

const SUBLET_PATTERNS = [/\bsublet(ting|ter)?\b/i, /\bsublease\b/i, /\blease takeover\b/i];

export function isSeekingPost(text: string): boolean {
  return SEEKING_PATTERNS.some((pattern) => pattern.test(text));
}

export function isSubletPost(text: string): boolean {
  return SUBLET_PATTERNS.some((pattern) => pattern.test(text));
}

export interface GroupPost {
  postId: string;
  permalink: string;
  author: string | null;
  text: string;
  photos: string[];
  postedAt: string | null;
}

/** Group and post ids out of any permalink shape Facebook uses for a group post. */
export function parsePermalink(href: string): { groupId: string; postId: string } | null {
  const posts = /\/groups\/([^/?#]+)\/(?:posts|permalink)\/(\d+)/.exec(href);
  if (posts?.[1] && posts[2]) return { groupId: posts[1], postId: posts[2] };
  const query = /\/groups\/([^/?#]+)\/?\?[^#]*\bmulti_permalinks=(\d+)/.exec(href);
  if (query?.[1] && query[2]) return { groupId: query[1], postId: query[2] };
  return null;
}

/**
 * Posts are read from their article container, the author from the article's accessible
 * label, the body from the article text minus the reaction and comment chrome, and the id
 * from the permalink the timestamp link points at.
 */
export function parseGroupFeed(html: string): GroupPost[] {
  const $ = cheerio.load(html);
  const byId = new Map<string, GroupPost>();

  $('div[role="article"], article').each((_, el) => {
    const article = $(el);
    const permalinkAnchor = article
      .find('a[href*="/posts/"], a[href*="/permalink/"], a[href*="multi_permalinks="]')
      .toArray()
      .map((a) => $(a).attr("href") ?? "")
      .find((href) => parsePermalink(href) !== null);
    if (!permalinkAnchor) return;

    const ids = parsePermalink(permalinkAnchor);
    if (!ids || byId.has(ids.postId)) return;

    const label = article.attr("aria-label") ?? "";
    const authorFromLabel = /^(?:Post|Comment) (?:by|from) (.+?)(?:\s+in\b|$)/i.exec(label);
    const author =
      authorFromLabel?.[1] ??
      collapseWhitespace(article.find('h2 a, h3 a, strong a, [data-ad-rendering-role="profile_name"] a').first().text()) ??
      null;

    const body = article.find('[data-ad-rendering-role="story_message"], [data-ad-comet-preview="message"]').first();
    const text = collapseWhitespace((body.length > 0 ? body : article).text());
    if (text.length === 0) return;

    const photos = [
      ...new Set(
        article
          .find("img")
          .toArray()
          .map((img) => $(img).attr("src") ?? "")
          .filter((src) => src.startsWith("http") && src.includes("scontent")),
      ),
    ];

    const time = article.find("abbr[data-utime], time[datetime]").first();
    const datetime = time.attr("datetime");
    const utime = time.attr("data-utime");
    const postedAt = datetime
      ? new Date(datetime).toISOString()
      : utime
        ? new Date(Number(utime) * 1000).toISOString()
        : null;

    byId.set(ids.postId, {
      postId: ids.postId,
      permalink: permalinkAnchor.startsWith("http")
        ? permalinkAnchor
        : `${ORIGIN}${permalinkAnchor}`,
      author: author && author.length > 0 ? author : null,
      text,
      photos,
      postedAt: postedAt && !Number.isNaN(Date.parse(postedAt)) ? postedAt : null,
    });
  });

  return [...byId.values()];
}

function groupIdOf(groupUrl: string): string {
  const match = /\/groups\/([^/?#]+)/.exec(groupUrl);
  return match?.[1] ?? groupUrl;
}

const PRICE_PATTERN = /\$\s?([\d,]{3,6})(?:\s?(?:\/|per\s)\s?(?:mo|month|room|bed|person))?/i;
const BEDS_PATTERN = /(\d{1,2})\s*(?:-|\s)?\s*(?:bed(?:room)?s?|br|bdr)\b/i;
const ADDRESS_PATTERN = /\b(\d{2,5}\s+[NSEW]?\.?\s?[A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*){0,3}\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Dr|Drive|Ln|Lane|Ct|Court|Pl|Place|Way|Ter|Terrace|Pkwy|Parkway))\b/;

/**
 * Only unambiguous patterns are pulled from post text. The server's normalize step does the
 * deeper extraction from description, so a near miss here is not worth a wrong number.
 */
export function postToListing(post: GroupPost): RawListingInput {
  const firstLine = post.text.split("\n")[0] ?? post.text;
  const title = firstLine.slice(0, 100).trim() || "Facebook group post";
  const priceMatch = PRICE_PATTERN.exec(post.text);
  const bedsMatch = BEDS_PATTERN.exec(post.text);
  const addressMatch = ADDRESS_PATTERN.exec(post.text);
  const beds = bedsMatch ? Number(bedsMatch[1]) : null;

  return {
    sourceId: SOURCE_ID,
    sourceListingId: post.postId,
    url: post.permalink,
    title,
    description: post.text,
    price: priceMatch ? parseMoney(priceMatch[1]) : null,
    beds: beds !== null && beds > 0 && beds <= 12 ? beds : null,
    address: addressMatch?.[1] ?? null,
    propertyType: propertyTypeFrom(post.text),
    isSublet: isSubletPost(post.text),
    photos: post.photos,
    postedAt: post.postedAt,
    contact: { name: post.author, formUrl: post.permalink },
  } satisfies RawListingInput;
}

export function parseGroupFeedToListings(html: string): RawListingInput[] {
  return parseGroupFeed(html)
    .filter((post) => !isSeekingPost(post.text))
    .map(postToListing);
}

/** Words that mark a joined group as a housing group worth watching. */
const HOUSING_WORDS = [
  "housing",
  "sublet",
  "sublease",
  "roommate",
  "apartment",
  "rent",
  "off-campus",
  "off campus",
  "hopkins",
  "jhu",
];

export interface JoinedGroup {
  id: string;
  name: string;
  url: string;
}

/**
 * Reads the signed-in user's joined groups and keeps the ones whose names read like housing
 * groups. The result is plain data, so a future server endpoint can offer it in the dashboard
 * without this package knowing anything about the server.
 */
export async function findHousingGroups(page: BrowserPage): Promise<JoinedGroup[]> {
  await page.goto(`${ORIGIN}/groups/joins/?nav_source=tab`);
  await page.scrollToBottom();
  await page.waitForTimeout?.(3000);
  return parseJoinedGroups(await page.content());
}

export function parseJoinedGroups(html: string): JoinedGroup[] {
  const $ = cheerio.load(html);
  const byId = new Map<string, JoinedGroup>();

  $('a[href*="/groups/"]').each((_, el) => {
    const anchor = $(el);
    const href = anchor.attr("href") ?? "";
    const match = /\/groups\/([^/?#]+)\/?(?:[?#]|$)/.exec(href);
    const id = match?.[1];
    if (!id || id === "joins" || id === "feed" || id === "discover" || byId.has(id)) return;
    const name = collapseWhitespace(anchor.text());
    if (name.length < 3) return;
    const lower = name.toLowerCase();
    if (!HOUSING_WORDS.some((word) => lower.includes(word))) return;
    byId.set(id, { id, name, url: `${ORIGIN}/groups/${id}` });
  });

  return [...byId.values()];
}

function groupsFrom(config: Record<string, unknown>): string[] {
  const value = config["groups"];
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.length > 0);
}

/** Rotates through the configured groups so every group is visited over successive runs. */
let rotationOffset = 0;

export function selectGroupsForRun(groups: readonly string[], offset: number): string[] {
  if (groups.length <= MAX_GROUPS_PER_RUN) return [...groups];
  const start = offset % groups.length;
  return Array.from(
    { length: MAX_GROUPS_PER_RUN },
    (_unused, i) => groups[(start + i) % groups.length] ?? "",
  ).filter((url) => url.length > 0);
}

function feedUrl(group: string): string {
  const id = groupIdOf(group);
  // sorting_setting=CHRONOLOGICAL is what the "Most recent" toggle in the group feed sets.
  return `${ORIGIN}/groups/${id}/?sorting_setting=CHRONOLOGICAL`;
}

export const facebookGroupsAdapter: SourceAdapter = {
  id: SOURCE_ID,
  name: "Facebook housing groups",
  kind: "account",
  homepage: `${ORIGIN}/groups`,
  defaultIntervalSec: 1800,
  defaultEnabled: false,
  peerPosted: true,
  defaultConfig: { groups: [] },

  async needsSetup(ctx) {
    if (groupsFrom(ctx.config).length === 0) {
      return "Add the housing groups you belong to. Find them by searching Facebook groups for your school name plus housing, sublets, or roommates.";
    }
    const page = await ctx.browser.newPage({ profileName: FACEBOOK_PROFILE });
    try {
      await page.goto(`${ORIGIN}/groups/feed/`);
      return (await isLoggedIn(page))
        ? null
        : "Not signed in to Facebook. Run `pnpm --filter @housing/sources fb:login`, sign in in the window that opens, then close it.";
    } finally {
      await page.close();
    }
  },

  async search(ctx: SourceContext): Promise<RawListingInput[]> {
    const groups = groupsFrom(ctx.config);
    const selected = selectGroupsForRun(groups, rotationOffset);
    rotationOffset += selected.length;

    const collected: RawListingInput[] = [];
    for (const group of selected) {
      const page = await ctx.browser.newPage({ profileName: FACEBOOK_PROFILE });
      try {
        await page.goto(feedUrl(group));
        await page.waitForSelector('div[role="article"]');
        await page.scrollToBottom();
        await page.waitForTimeout?.(3000);
        const listings = parseGroupFeedToListings(await page.content());
        // Group posts carry students' names and private-group text, so only counts are logged.
        ctx.log.debug("facebook group scanned", { group: groupIdOf(group), count: listings.length });
        collected.push(...listings);
      } finally {
        await page.close();
      }
    }
    return collected;
  },
};
