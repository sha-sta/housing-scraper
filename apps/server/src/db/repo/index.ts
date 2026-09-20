import type { Db } from "../client.ts";
import { createConfigRepo, type ConfigRepo } from "./config.ts";
import { createListingRepo, type ListingRepo } from "./listings.ts";
import { createNotifyRepo, type NotifyRepo } from "./notify.ts";
import { createOutreachRepo, type OutreachRepo } from "./outreach.ts";
import { createProfileRepo, type ProfileRepo } from "./profiles.ts";

export interface Repos {
  listings: ListingRepo;
  profiles: ProfileRepo;
  outreach: OutreachRepo;
  notify: NotifyRepo;
  config: ConfigRepo;
}

export function createRepos(db: Db): Repos {
  return {
    listings: createListingRepo(db),
    profiles: createProfileRepo(db),
    outreach: createOutreachRepo(db),
    notify: createNotifyRepo(db),
    config: createConfigRepo(db),
  };
}

export type { ConfigRepo, ListingRepo, NotifyRepo, OutreachRepo, ProfileRepo };
export type { StoredMatch } from "./profiles.ts";
export type { GeocodeHit, StoredSettings, StoredSource } from "./config.ts";
export type { HoldRecord } from "./notify.ts";
export type { ListingSourceRecord } from "./listings.ts";
