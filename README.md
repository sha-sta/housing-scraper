# housing-scraper

A landlord posts a 6 bedroom row home near the Johns Hopkins Homewood campus on a Tuesday afternoon. If another student group emails before yours, that group gets the first tour. This app watches the listing sites for you, and when a new listing fits what your group wants, your phone buzzes within a few minutes with the price, the walk time, and a button that opens a prewritten email to the landlord.

You run it on your own computer. Nothing is shared with anyone else, and every JHU student who uses it sets their own preferences.

## 1. What it does

1. It checks each listing site every 2 to 30 minutes, depending on the site.
2. It merges the same unit seen on two sites into one listing.
3. It compares every listing against your search profiles. A profile is one set of preferences, such as "row home for 6" or "apartment for 4". You can have several.
4. When a listing matches a profile, it sends a push notification through [ntfy](https://ntfy.sh), a free app for phone notifications.
5. It writes an outreach message for the listing and keeps it ready. You send it from your own school mailbox with one tap.
6. The dashboard shows every listing, why it scored the way it did, and where each one stands, from new to signed.

## 2. Set it up

On a Mac, open the Terminal app, paste this line, and press Return.

```sh
curl -fsSL https://raw.githubusercontent.com/sha-sta/housing-scraper/main/scripts/install.sh | sh
```

The installer needs no password. On a Mac that has never been used for programming, macOS first opens a window asking to install Apple's developer tools. Click Install and leave the Terminal open. The installer continues by itself when that finishes. It then downloads its own copy of Node into `~/.housing-scraper`, puts the app in `~/housing-scraper`, starts it in the background, and opens the setup page. It takes a few minutes. Paste the same line again later to update. Your listings and settings are kept.

If you would like to run it from a clone instead, you need [Node](https://nodejs.org) 24 or newer and [pnpm](https://pnpm.io).

```sh
git clone https://github.com/sha-sta/housing-scraper.git
cd housing-scraper
pnpm install
pnpm --filter @housing/sources exec playwright install chromium
pnpm build
pnpm start
```

The setup page is http://localhost:4747. A wizard asks for your campus, your name and school email, and your first profile. Then it shows a QR code. Install the ntfy app on your phone, scan the code, and press Test push in the wizard. Your phone should buzz.

The first check of each site finds every listing that already exists. The app does not push those one by one. It sends a single summary push, and the listings wait for you in the dashboard. After that, only new listings push.

## 3. Profiles

Each profile has hard limits and preferences. A listing that breaks a hard limit never matches. Preferences raise or lower a score from 0 to 100.

| Setting | Examples |
| --- | --- |
| Group and budget | people in the group, maximum rent per person, ideal rent per person |
| Size and type | bedrooms, bathrooms, row home, apartment, house, single room |
| Location | campus or a custom point, maximum walk in minutes, neighborhoods to include or exclude |
| Dates | move-in window, lease length |
| Amenities | each one set to must, prefer, avoid, or ignore (laundry in unit, parking, air conditioning, pets, and more) |
| Rules | sublets, rooms in shared units, income-restricted housing, senior housing, suspected scams |
| Exclusions | buildings, addresses, landlords, keywords, whole sites |
| Notifications | minimum score to push, quiet hours, price drops, a second topic for roommates |

Many student row homes are advertised per bedroom, for example "5 bedrooms available, $850". The app works out the rent for the whole house (5 times $850 is $4,250) and divides it by your group size, so a per-room price is never mistaken for a cheap house.

The dashboard can also show every listing a profile rejected, with the reason in plain words. Use that view to check that a limit is not hiding listings you would want.

## 4. Where listings come from

| Site | What you need to do |
| --- | --- |
| JHU Off-Campus Housing | nothing |
| Craigslist | nothing |
| AppFolio landlord pages | nothing to start. Add more landlords in Sources by entering the first part of their AppFolio address. |
| Redfin rentals | nothing |
| rent.com | nothing |
| Zumper | nothing. It loads in a hidden browser window. |
| Apartment List | off by default. Its listings have no address and no photos. |
| Facebook Marketplace | log in once, see section 5 |
| Facebook groups | log in once and list your groups, see section 5 |

Zillow, Apartments.com, and Realtor.com block automated visitors, so they are not included. The JHU portal is built on Apartments.com data, so much of that inventory near campus shows up there.

The Sources screen shows when each site was last checked and whether the check worked. If a site fails 5 times in a row, your phone gets a push saying so.

## 5. Facebook

Student houses often get handed down through Facebook housing groups, so both Marketplace and groups are supported. They work through a browser window that you log into yourself. Your password and cookies stay in the `data` folder on your computer and never enter this repository.

```sh
pnpm --filter @housing/sources fb:login    # opens a browser. Log in, then close the window.
pnpm --filter @housing/sources fb:groups   # lists the housing groups you already belong to
```

Paste the group links into the Facebook groups source on the Sources screen and turn the source on. To find more groups, search Facebook groups for your school name plus "housing", "sublets", or "roommates", and join them yourself.

The app only reads. It never joins a group, posts, comments, reacts, or sends a message.

Facebook's terms do not allow automated access. An account that uses it can be restricted. Both Facebook sources are off until you turn them on, and they load only a few pages every 15 to 30 minutes. The risk is still yours.

## 6. Sending the message

When a listing matches, the app fills a template with the listing's details and your group's introduction. If you set `ANTHROPIC_API_KEY`, Claude adjusts the wording to the listing. The app never invents facts about you.

The push on your phone has three buttons.

- **Open listing** opens the listing page.
- **Email landlord** opens your phone's mail app with the address, subject, and message filled in. Make Outlook your default mail app and the email leaves from your school address.
- **Mark contacted** moves the listing to the Contacted column.

On the dashboard, the same draft has Copy buttons and an Open in Outlook button. For a listing with only a phone number, the draft becomes a text message. For a listing with only a contact form, the app gives you the text to paste and a link to the form.

The app never sends anything by itself. If you would like it to send email directly, fill in the `SMTP_` values in `.env` and a Send now button appears.

## 7. Keep it running

The app only checks sites while it is running.

The one-line installer already set this up. From a clone on a Mac, install it as a background service that starts at login and restarts if it stops.

```sh
scripts/service.sh install     # also: uninstall, status, logs
```

The service keeps the Mac from sleeping when idle. A laptop with the lid closed still sleeps, so leave the lid open or run the app on a machine that stays on.

To run it on a server instead, use Docker.

```sh
cp .env.example .env
docker compose up -d
```

Set `DASHBOARD_PASSWORD` in `.env` first if the server is reachable from the internet.

Pushes work on your phone with no extra setup. Tapping one opens the listing's own page, and the buttons go through ntfy and your mail app.

The dashboard itself only answers on the computer it runs on. To open it from your phone, install [Tailscale](https://tailscale.com/download) on the computer and on the phone, and sign in to both with the same account. Tailscale is a free app that connects your own devices privately, and it works on campus Wi-Fi and on cellular. The app notices Tailscale within 30 seconds. Settings then shows an Open on your phone card with a QR code and one button that makes pushes link to the dashboard.

## 8. Limits you should know about

- The free ntfy.sh server allows 250 pushes a day. The app budgets 200 a day. After 160, it sends only the highest-scoring matches one by one and groups the rest into a digest every 30 minutes. If you run your own ntfy server, set its address in Settings.
- Craigslist's terms do not allow automated access either. The app makes one search request every 2 minutes and opens a listing page only when the listing is new.
- Walk times are estimates. The app multiplies the straight-line distance by 1.3 and assumes 3 miles per hour. Set `VALHALLA_URL` to a [Valhalla](https://github.com/valhalla/valhalla) routing server you run yourself to get real walking routes.
- Scam warnings are hints based on wording and price. Read every listing yourself and never pay a deposit before you have seen the place.
- This product uses the Census Bureau Data API but is not endorsed or certified by the Census Bureau. The app uses it to turn an address into map coordinates when a site does not provide them.

## 9. Work on the code

```sh
pnpm dev                                        # server with reload and the dashboard on port 5173
pnpm test                                       # unit and integration tests
pnpm e2e                                        # dashboard browser tests
pnpm --filter @housing/server start:demo        # adds a fake source that invents listings
pnpm --filter @housing/sources smoke jhu-och    # checks one site for real and prints what it found
```

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains how the parts fit together. [packages/sources/README.md](packages/sources/README.md) explains how to add a site. To use the app at another school, add a campus to `packages/shared/src/campuses.ts`.

MIT license.
