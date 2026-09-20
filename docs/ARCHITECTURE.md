# Architecture

One Node process runs the scheduler, the pipeline, the API, and serves the built dashboard. State lives in one SQLite file under `data/`. The process needs outbound network access only.

## Packages

| Path | Owns |
| --- | --- |
| `packages/shared` | Zod schemas and types for listings, preferences, profiles, and the REST and SSE contract. Campus presets. |
| `packages/sources` | The `SourceAdapter` contract, the shared HTTP client, the browser pool, and one adapter per listing site. |
| `apps/server` | Database, scheduler, pipeline, match engine, ntfy, mail, drafts, REST API, SSE. |
| `apps/web` | React dashboard. Talks to the server only through the contract in `packages/shared/src/api.ts`. |

## Pipeline

Each source runs on its own interval with jitter. One run does this:

1. `adapter.search(ctx)` returns `RawListingInput[]` for the union search area of all enabled profiles.
2. The pipeline validates each item with `RawListingSchema`. Invalid items are logged and dropped. Listings that are not housing (parking spots, garages, storage units) are dropped here too.
3. New items (unknown `sourceId` + `sourceListingId`) go through `adapter.enrich` when the adapter has one.
4. Normalize: clean the address, infer property type from text ("rowhome", "townhouse", "entire house"), extract amenities, available date, and lease length from the description, and extract emails and phone numbers from the description into `contact`.
5. Geocode when `lat` and `lon` are missing, using the US Census geocoder. Hits and misses are cached by address forever. The public Nominatim API is deliberately not used, because its usage policy restricts scripts that run on a schedule.
6. Dedupe: the same unit seen on two sources becomes one listing with two `sources` entries. Two records are the same unit when their normalized addresses (including unit number) match, or when they sit within 40 meters and agree on beds and price.
7. Scam signals are computed and stored. They never drop a listing. Profiles decide whether to hide flagged listings. The wording signals apply to every source. The two signals that compare a listing against others (`priceFarBelowArea`, `noAddressNoPhotos`) apply only to sources where anyone can post (`peerPosted` adapters), compare whole-unit rent, and leave out income-restricted housing and single rooms.
8. Upsert. A price change appends to `priceHistory`. A listing unseen for 3 consecutive successful runs of every one of its sources becomes `gone`. A `gone` listing that reappears becomes `active` again.
9. Evaluate the listing against every enabled profile and store one `Match` row per pair.
10. For each profile where the listing newly matched with `score >= notify.minScore`, create a notification and push it. When `outreach.autoDraft` is on and `score >= outreach.minScore`, stage a draft first so the push can carry the Send button.
11. Emit SSE events.

Price drops and back-on-market events follow the same notify path for listings that already matched.

## Match engine

`evaluate(listing, profile, now) -> Match` is a pure function. Hard filters run first and collect every failing `FilterReason`. The score is a weighted mean of five 0 to 100 components plus a capped keyword boost.

- `price`: 100 at or under `idealPerPerson`, linear down to 40 at `maxPerPerson`. 60 when the price is unknown.
- `distance`: 100 at or under `idealWalkMinutes`, linear down to 30 at `maxWalkMinutes`.
- `amenities`: share of `prefer` amenities the listing has, minus the share of `avoid` amenities it has. 50 when the profile prefers nothing.
- `size`: 100 when beds equals `beds.min`, minus 10 per extra bedroom, since extra rooms cost rent.
- `freshness`: 100 when first seen under 1 hour ago, decaying to 20 at 14 days.

Walk minutes default to haversine distance times 1.3, at 3 mph. When `VALHALLA_URL` points at a self-hosted Valhalla instance, the server asks it for a pedestrian route time instead. The public OSRM and FOSSGIS routing servers are not used.

A row with `bedsMax` stands for a building with several floor plans. The beds filter passes when the range from `beds` to `bedsMax` overlaps the profile's range. The engine then scores the smallest bed count inside the overlap. The rent for that bed count is interpolated between `price` and `priceMax`, because sources give only the two ends of the range.

Many student row homes are advertised per bedroom ("5 bedrooms available, $850"). `priceBasis` records whether a price rents the whole unit or one room. A source states it when it can. Otherwise normalize infers `room` from wording such as "per room" or "per bedroom", or when a listing with 2 or more bedrooms costs under $450 per bedroom. The engine prices a per-room listing at `price` times its bedroom count, stores that as `monthlyTotal`, and divides by `group.size` for the per-person price. A single room in a shared unit (`propertyType: "room"`) has a per-person price equal to its listed price.

## Notifications

The server publishes JSON to the ntfy server named in settings. Every match push carries:

- title: price, beds, and address
- message: score, per-person price, walk minutes, available date, source
- click: the dashboard URL of the listing
- attach: the first photo
- priority 5 when `score >= urgentScore`, else 4
- actions, at most 3 (the ntfy limit). `view` Open listing goes on every push. The owner topic also gets a contact action and, when that contact action only opens a link, an `http` Mark contacted action.

The contact action depends on the draft. An email draft gets `view` Email landlord with a `mailto:` link that opens a prefilled message in the phone's mail app, so the email leaves from the user's own school address. When SMTP is configured, the email draft gets `http` Send email instead. A phone-only listing gets an `sms:` link. A form-only listing gets a link to the form.

### Links that work on a phone

A push is read on a phone, and `localhost` on a phone is the phone. When `dashboardUrl` is a localhost address, the push's tap target is the listing's own page on the source site, and summary pushes carry no tap target. When `dashboardUrl` is reachable (a Tailscale address or a public server), the tap target is the listing's dashboard page.

The server listens on `127.0.0.1` by default. It also listens on the machine's Tailscale address (an address in 100.64.0.0/10) when one exists, and it rechecks every 30 seconds so that Tailscale starting after the server still works. It listens on every interface only when `HOST` says so, which the Docker image does. `GET /network` reports what the server found, and the Settings screen turns that into a QR code and one button that points `dashboardUrl` at the Tailscale address.

### Send button without inbound access

A phone cannot reach a Mac behind NAT. The Send email and Mark contacted actions are `http` actions that POST to `<ntfyServer>/<NTFY_COMMAND_TOPIC>` with the body `send:<draftId>:<hmac>` or `sent:<draftId>:<hmac>`. The server holds an open subscription to that topic. It verifies the HMAC (SHA-256 of the draft id with `APP_SECRET`), checks that the draft is still `staged`, and sends it. The command topic name is a secret from `.env`. A leaked topic name lets an attacker do nothing without the HMAC, and a leaked HMAC lets an attacker send only the draft that the owner already staged.

### Quiet hours

Pushes inside a profile's quiet window are stored with `pushed: false`. When the window ends, the server sends one digest push per profile.

### Source health

A source with 5 consecutive failures raises a `sourceDown` notification on every profile's owner topic. The first success after that raises `sourceRecovered`. Blocked sources (`SourceBlockedError`) back off exponentially up to 1 hour.

## Outreach

A draft is rendered from a template with `{{variable}}` placeholders. When `ANTHROPIC_API_KEY` is set, the server asks Claude to personalize the rendered template with details from the listing description. The template text is the fallback on any API failure.

The draft channel is `email` when the listing has an email address, `sms` when it has only a phone number, and `form` when it has only a reply link or a form.

The default way to send is a compose link. `composeUrl` in `packages/shared` builds a `mailto:`, Outlook on the web, or Gmail link with the address, subject, and body filled in, and the user sends the message from their own mailbox. The dashboard also has copy buttons. The user then marks the draft as sent, from the dashboard or from the Mark contacted button on the push.

SMTP sending is optional and appears only when the SMTP variables are set. The app never sends a second email to the same address for the same listing. A sent draft moves its listing to stage `contacted`.

## Facebook

Both Facebook adapters run through a persistent browser profile that holds the login of the person running the app. The repository never sees a password or a cookie. The adapters only read. They never join a group, post, comment, react, or message. The groups adapter reads only groups the user already belongs to and lists in its config.

## Database tables

`listings`, `listing_sources` (unique on source id + source listing id, with a `missed_runs` counter), `listing_state`, `matches` (primary key listing id + profile id, with `notified_at`), `profiles`, `drafts`, `templates`, `notifications`, `sources` (enabled, interval, config, health counters), `geocode_cache`, `settings` (single row), `outbox_holds` (pushes held for quiet hours).

JSON columns hold `photos`, `amenities`, `contact`, `scamSignals`, `priceHistory`, and `preferences`. Every JSON read is parsed with the matching Zod schema.

## Environment

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port, default 4747 |
| `HOST` | Interface to listen on, default `127.0.0.1` plus the Tailscale address when present. The Docker image sets `0.0.0.0`. |
| `DATA_DIR` | SQLite file and browser profiles, default `./data` |
| `APP_SECRET` | HMAC key for Send actions. Generated into `.env` on first run when missing. |
| `NTFY_COMMAND_TOPIC` | Secret topic the server listens on. Generated on first run when missing. |
| `NTFY_TOKEN` | Optional ntfy access token for a self-hosted or paid server |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Outgoing mail |
| `ANTHROPIC_API_KEY` | Optional. Enables personalized drafts. |
| `ANTHROPIC_MODEL` | Optional. Model for drafts, default `claude-sonnet-5`. |
| `VALHALLA_URL` | Optional. Self-hosted Valhalla for real walking times. |
| `DASHBOARD_PASSWORD` | Optional. Turns on HTTP basic auth, for a public VPS. |
| `DEMO` | `1` registers a demo source that emits synthetic listings, for development and e2e tests |
