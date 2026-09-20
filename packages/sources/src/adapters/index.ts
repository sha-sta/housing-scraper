import type { SourceAdapter } from "../types.ts";
import { apartmentListAdapter } from "./apartmentlist.ts";
import { appfolioAdapter } from "./appfolio.ts";
import { craigslistAdapter } from "./craigslist.ts";
import { facebookGroupsAdapter } from "./facebook-groups.ts";
import { facebookMarketplaceAdapter } from "./facebook-marketplace.ts";
import { jhuOchAdapter } from "./jhu-och.ts";
import { redfinAdapter } from "./redfin.ts";
import { rentcomAdapter } from "./rentcom.ts";
import { zumperAdapter } from "./zumper.ts";

/** Registry the server reads at startup. Order is the order the dashboard lists them in. */
export const adapters: SourceAdapter[] = [
  jhuOchAdapter,
  craigslistAdapter,
  appfolioAdapter,
  zumperAdapter,
  redfinAdapter,
  rentcomAdapter,
  apartmentListAdapter,
  facebookMarketplaceAdapter,
  facebookGroupsAdapter,
];

export {
  apartmentListAdapter,
  appfolioAdapter,
  craigslistAdapter,
  facebookGroupsAdapter,
  facebookMarketplaceAdapter,
  jhuOchAdapter,
  redfinAdapter,
  rentcomAdapter,
  zumperAdapter,
};
