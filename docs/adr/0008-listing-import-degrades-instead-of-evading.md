# 0008. Listing import degrades instead of evading

- Status: Accepted
- Date: 2026-08-01

## Context

Adding a stay starts with a link, usually to Booking.com. Reading that page
server-side would fill the form in one click, and for a lot of sites it does:
Airbnb, Vrbo, Agoda and most independent hotels answer a plain `fetch` with a
`<head>` full of Open Graph tags and schema.org JSON-LD.

Booking.com does not, and never will. It answers our request with `403` before
any HTML exists. The judgement is made on the caller, not the request: the IP's
reputation (every cloud host is known), the TLS and HTTP/2 fingerprints that
say "this is not Chrome", and the absence of a session the site's own JavaScript
would have established. We confirmed the shape of it while working the bug —
every `User-Agent` we tried, including Googlebot and the social-preview
crawlers, gets the same refusal. Expedia, Hotels.com and Vrbo's search pages
behave the same way.

So this is not an extraction bug. `parseListingHtml` never sees a page to
misparse. The question is only what to do with a door that is closed.

## Decision

**Do not try to get through it.** Rejected, in order:

- **Better headers / a rotating `User-Agent`.** Fixes nothing — the block is on
  the connection, not the header. We keep one honest browser `User-Agent` and
  nothing more.
- **Headless Chromium.** Solves the fingerprint and not the IP, so the same
  `403` arrives from a much heavier process. It also does not fit the target
  (Vercel functions) on size or execution time.
- **A residential-proxy unblocking service** (ScrapingBee, Zyte, Bright Data
  and friends). This works, and it is a per-request bill, a third-party
  dependency in a form's happy path, and a deliberate circumvention of an access
  control the site is entitled to apply. Not for a group-trip planner.

**Degrade in steps instead, and say which step answered.** Four sources, most
informative first:

1. `page` — Open Graph and JSON-LD, when the site lets us read it.
2. `urlHints` — what the URL itself encodes. Booking's own URL carries the
   property slug, the ISO country code, the dates and the guest counts.
3. `place` — Google Places, looked up from that slug. A lookup, not a scrape:
   nothing is fetched from the site that refused us. It knows the real name and
   postal address, and never a price.
4. `pageText` — the listing as the traveller copied it out of their own browser,
   offered only after a block. Their browser is not blocked; ours is.

The paste is the important one. It is the only source that carries the price
quoted for _these_ dates, and it needs no key, no vendor and no evasion — the
person adding the stay is already looking at the page. `condenseListingText`
strips the site furniture and the repeated rate rows so a 100k-character copy
fits in a prompt.

## Consequences

- Booking.com imports fill the form completely, but only after one copy-paste.
  The dialog asks for it exactly when a site has refused us, never before.
- The extractor takes free-form page text as an input, so the prompt has to rank
  its sources explicitly. `pageText` outranks the rest; the URL hints stay in the
  context because a copied page shows dates as "18 Aug – 24 Aug" while the URL
  says which year.
- `source` (`page` / `url` / `place` / `paste`) is part of the endpoint's
  contract, and the client says which one filled the form. A half-filled form
  must never look like a scrape that succeeded.
- If a site newly blocks us, the flow degrades on its own — there is no
  per-site list to maintain.
- We accept that a fully automatic Booking.com import is not available to us
  without a partner API. Their affiliate/Demand API is the only legitimate route
  to it, and it needs an approved account; revisit if this project ever has one.
