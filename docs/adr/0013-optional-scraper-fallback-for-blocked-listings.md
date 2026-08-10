# 0013. An optional scraper fallback for blocked listings

- Status: Accepted
- Date: 2026-08-10
- Amends: [ADR-0008](0008-listing-import-degrades-instead-of-evading.md)

## Context

ADR-0008 rejected residential-proxy unblocking services and built a ladder of
degrading sources instead. The ladder works, and for Booking.com hotel URLs it
does roughly what it promised: the URL alone yields a property name, a country
and the stay dates, and Google Places turns that into a real name and address.

Two things it does not do turned up while diagnosing real links
(`pnpm diagnose:url` reproduces all of them):

1. **A URL that encodes no name leaves nothing at all.** `airbnb.com/rooms/36276450`
   is a number. When Airbnb answers a server-side fetch — which it increasingly
   does not, from a cloud IP — the ladder has no slug to look up, so
   `hasUsableSignal` is false and the endpoint returns
   `{ success: false, source: "none" }`. The member gets "Could not extract
   details" and an empty form. Rungs 2, 3 and 4 all exist and none of them can
   fire. This is the common Airbnb case, not an edge case.
2. **A share link named the stay after the share code.** `booking.com/Share-ZPdrnKD`
   has one path segment, and `humaniseSlug` turned it into the property name
   "Share ZPdrnKD", which then went to Google Places as a search query.

Neither is an argument about proxies; both are fixed below on their own. But
the first one is also the case where the ladder has genuinely run out, and the
project owner has asked for the rung ADR-0008 declined.

## Decision

**Add the rung, off by default, behind configuration the operator owns.**

`SCRAPER_API_KEY` turns on one extra step, tried only after a direct fetch has
failed or come back as a robot check, and never when the member has pasted the
page. With it unset — the default, and what CI runs — not a single byte of
behaviour changes and no third party is contacted.

`SCRAPER_PROVIDER` defaults to `scrapingowl` rather than being required
alongside the key. Demanding both made the obvious setup, pasting the key into
Doppler, silently leave the rung switched off, and the resulting "that site
blocked us" is indistinguishable from the failure this rung exists to remove. A
key is an explicit opt-in on its own; naming the vendor is only needed to pick a
different one.

The reasoning in ADR-0008 is not withdrawn; it is priced. What changes is who
decides:

- **Cost** is now a deliberate, observable spend: nothing is scraped on the
  happy path, `SCRAPER_HOSTS` can narrow it to the sites that actually block
  us, and `describeConfig()` reports which vendor is in the path.
- **The third-party dependency** is not in the happy path and cannot break it.
  `scrapeListingPage` never throws; every failure falls through to the same
  rungs that exist today, and `blocked` still reaches the client, so the paste
  box still appears when nothing got through.
- **Circumventing an access control** remains the operator's call to make, not
  the code's. The default answer stays no.

**Describe the vendor in configuration, not in code.** Every service in this
market is the same call with different names for the same five things: an
endpoint, where the key goes, what the URL parameter is called, a flag for
rendering JavaScript, and where the HTML is in the reply.
`server/utils/scraper/providers.ts` holds presets for ScrapingOwl, ScrapingBee,
ScraperAPI, ZenRows and Scrapfly, and every field of every preset is
overridable by an environment variable. Switching vendor — including to one
that does not have a preset, via `SCRAPER_PROVIDER=custom` — is an env edit and
a redeploy of configuration, never a code change. The presets are a
convenience, not a contract we control: if a vendor renames a parameter,
`SCRAPER_URL_PARAM` fixes it the same afternoon.

**Fix the two ladder bugs regardless of the scraper**, since they cost nothing
and help the deployments that leave it off:

- `humaniseSlug` now rejects tokens that are identifiers wearing letters — no
  vowel, or a case change mid-word. `Share-ZPdrnKD` names nothing again.
- `resolveListingRedirects` follows a share link's `Location` chain with
  `redirect: "manual"`. Booking.com answers `/Share-…` with a `302` and only
  puts the robot check at the destination, so the redirect is readable when the
  page is not — which turns a share link back into a property, a country and
  the dates. Hops into private address space are neither followed nor returned.

**Put the whole ladder in one module.** `server/utils/listingSource.ts` is the
five rungs in order, testable without a network; the router above it only turns
the result into a prompt.

## Consequences

- `source` gains a value: `scraper`. It stays part of the endpoint's contract
  and the client still says which rung filled the form — a page read on the
  second attempt is not presented as a first-attempt success.
- The default deployment is unchanged, so ADR-0008's guarantees still describe
  it. A deployment that sets the variables is making a different trade, and
  `/api/health` says so.
- One more thing to keep working: if a vendor changes its API, imports on
  blocked sites quietly go back to the old degrade path. The failure is visible
  in the logs (`scope: "scraper"`) and in `pnpm diagnose:url`, and it is never
  an error the member sees.
- Booking.com's affiliate/Demand API is still the only route to a supported
  automatic import, and still the one to take if this project ever qualifies.
