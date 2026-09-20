import { createBrowserPool } from "./browser.ts";
import { FACEBOOK_PROFILE } from "./adapters/facebook-marketplace.ts";
import { findHousingGroups } from "./adapters/facebook-groups.ts";
import type { Logger } from "./types.ts";

/**
 * Lists the housing groups the signed-in account already belongs to, so the user can paste
 * the URLs into the facebook-groups source config. It only reads the joined-groups page; it
 * never joins anything.
 */
const silent: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: (msg) => process.stderr.write(`${msg}\n`),
};

const dataDir = process.env["DATA_DIR"] ?? "./data";
const pool = createBrowserPool({ log: silent, dataDir, headless: true });
const page = await pool.newPage({ profileName: FACEBOOK_PROFILE });

try {
  const groups = await findHousingGroups(page);
  if (groups.length === 0) {
    process.stdout.write(
      [
        "No joined groups matched the housing words.",
        "If you are not signed in, run `pnpm --filter @housing/sources fb:login` first.",
        "Otherwise search Facebook groups for your school name plus housing, sublets, or roommates, join them, and run this again.",
        "",
      ].join("\n"),
    );
  } else {
    process.stdout.write(`Found ${groups.length} housing groups you belong to:\n\n`);
    for (const group of groups) {
      process.stdout.write(`  ${group.name}\n    ${group.url}\n`);
    }
    process.stdout.write(
      `\nPaste the URLs into the facebook-groups source config:\n  { "groups": ${JSON.stringify(groups.map((g) => g.url))} }\n`,
    );
  }
} finally {
  await page.close();
  await pool.close();
}
