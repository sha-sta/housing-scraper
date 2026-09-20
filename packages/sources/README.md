# @housing/sources

One adapter per listing site. Each one turns a site's search results into `RawListingInput`
rows, which is the shape defined in `packages/shared/src/listing.ts`.

## Adding an adapter

Create `src/adapters/<id>.ts` and write two things: a pure `parse...` function that takes a
string or a parsed JSON value and returns `RawListingInput[]`, and a `SourceAdapter` object
that fetches and calls it. Keeping them apart is what makes the parser testable without a
network.

The adapter reads where to search from `ctx.area` (center, radius, bounding box, zip codes)
and reads per-site settings from `ctx.config`. Never write a city or a coordinate into the
adapter itself. A forker at another campus changes the campus preset and the source config,
nothing else.

Register the adapter in `src/adapters/index.ts`. The server reads that array at startup.

```ts
export const exampleAdapter: SourceAdapter = {
  id: "example",
  name: "Example Rentals",
  kind: "http",                 // "browser" needs Chromium, "account" needs the user's login
  homepage: "https://example.com",
  defaultIntervalSec: 600,
  defaultEnabled: true,
  defaultConfig: { citySlug: "baltimore-md" },
  needsSetup: async () => null, // a sentence telling the user what to fix, or null
  async search(ctx) {
    const res = await ctx.http.fetch(url, { browserHeaders: true, signal: ctx.signal });
    return parseExample(await res.text()).filter((l) => inArea(ctx.area, l.lat, l.lon));
  },
};
```

## Rules the parsers follow

A site response is `unknown` until a Zod schema narrows it. Call `decode(schema, value,
"where")` from `src/decode.ts`. When the shape does not match, it throws `SourceLayoutError`
naming the field that failed, and the scheduler reports the source as broken instead of
silently returning nothing.

`search` must be cheap, one or a few requests. Anything that needs a page per listing goes
in `enrich`, which the pipeline calls only for listings it has never seen.

## Testing

Fetch each page once, save it under `test/fixtures/<adapter>/`, and iterate against the
saved copy. Replace real phone numbers, emails and people's names with 555 numbers and
example.com addresses before saving, because this repo is public. Trim each fixture to a
few listings.

Write the parser test against that fixture with concrete values, not shapes. Assert that a
specific listing has a specific price and address.

```
pnpm --filter @housing/sources test
pnpm --filter @housing/sources smoke <adapterId>
```

`smoke` runs a real search for the JHU Homewood preset and prints how many listings came
back and what share of them carry a price, beds, an address, coordinates, photos, an
available date, a phone number and an email address. Use it to tell a broken parser from a
site that simply has nothing today.

## Facebook

The two Facebook adapters run through a persistent Chromium profile that holds the user's
own login. Run `pnpm --filter @housing/sources fb:login`, sign in in the window that opens,
then close it. The repo never sees a password or a cookie. Run `pnpm --filter
@housing/sources fb:groups` afterwards to list the housing groups the account already
belongs to. Automated access can get a Facebook account restricted, so both adapters are
off by default.
