import { openHeadedProfile } from "./browser.ts";
import { FACEBOOK_PROFILE } from "./adapters/facebook-marketplace.ts";

/**
 * Opens a real Chromium window on facebook.com using the persistent profile the Facebook
 * adapters read. The user signs in themselves and closes the window. No password, cookie, or
 * token ever passes through this repo; the session lives only in the profile directory.
 */
const dataDir = process.env["DATA_DIR"] ?? "./data";

process.stdout.write(
  [
    "Opening Facebook in a browser window.",
    "Sign in there, then close the window when the feed loads.",
    `Profile directory: ${dataDir}/browser-profiles/${FACEBOOK_PROFILE}`,
    "",
    "",
  ].join("\n"),
);

const { closed } = await openHeadedProfile(dataDir, FACEBOOK_PROFILE, "https://www.facebook.com/");
await closed;

process.stdout.write(
  [
    "Window closed. The session is saved in the profile directory.",
    "Next, to find the housing groups you already belong to:",
    "  pnpm --filter @housing/sources fb:groups",
    "",
  ].join("\n"),
);
