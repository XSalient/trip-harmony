# 0014. A scraper vendor is whatever configuration says it is

- Status: Accepted
- Date: 2026-08-10
- Amends: [ADR-0013](0013-optional-scraper-fallback-for-blocked-listings.md)

## Context

ADR-0013 decided that the unblocking vendor is described in configuration
rather than in code, so switching service is an environment edit. The presets
in `server/utils/scraper/providers.ts` were the convenience layer on top of
that.

The convenience layer turned out to be a gate. `SCRAPER_PROVIDER` was matched
by lowercasing the value and stripping it to letters, then looking the result
up in the preset table. That accepts `scrapingowl`, `ScrapeOwl` and
`scraping-owl`, and rejects everything else — including every name a vendor
actually uses about itself.

The `dev` config held `SCRAPER_PROVIDER=scraperapi.com`, which is what
ScraperAPI's dashboard is called and what anyone pasting from it would write.
The account was live and the key was good. The resolver threw, and the throw
was invisible: `isScraperConfigured()` required a provider name _and_ a key
before anything would attempt a scrape, so an unresolvable name read as "this
rung was deliberately left off". Imports degraded exactly as they would have
with no vendor at all, and `/api/health` said `scraper: "disabled"` — which is
what an operator would read as "as configured".

So the decision that switching vendor costs nothing was true of the code and
false in practice: it cost a support round trip, and the failure pointed away
from itself. That is worse than requiring a code change, because a code change
at least fails where you are looking.

## Decision

**Resolve the vendor from whatever the operator wrote, and reserve refusal for
the one case that is genuinely dangerous.**

1. **A provider name is reduced to the vendor before lookup.** A URL becomes
   its host; a host loses `api.` / `www.` / `app.` and its public suffix; what
   is left is stripped to letters. `scraperapi`, `ScraperAPI`, `scraper-api`,
   `scraperapi.com` and `https://api.scraperapi.com/` are one service. The
   alias table covers the rest (`scrapeowl` → `scrapingowl`, `proxycrawl` →
   `crawlbase`).

2. **An unrecognised name with an endpoint is a vendor, not an error.**
   `SCRAPER_ENDPOINT` describes a service completely; the name is then a label
   for the logs and may be omitted. A vendor that launches after this file was
   last edited works without a deploy of ours, which is what ADR-0013 promised.
   `SCRAPER_PROVIDER=custom` still works and is no longer special.

3. **The endpoint is never guessed.** An unrecognised name with no endpoint is
   still refused, loudly. Posting a live API key at an address nobody supplied
   is the one failure worth stopping for.

4. **The key alone decides whether the rung is on.** `isScraperConfigured()`
   asks only whether `SCRAPER_API_KEY` is set. A key that is set but unusable is
   now a distinct, reported state rather than silence.

5. **Every remaining blank is a variable.** `SCRAPER_RENDER_PARAM` names the
   render flag, and `SCRAPER_API_KEY_IN=basic` authenticates in the transport,
   which is how Zyte and several enterprise unblockers work. These were the last
   two shapes that would have needed a patch.

## Consequences

- `/api/health` gains a third scraper state. `disabled` now means exactly one
  thing — no key in this environment — and `misconfigured` carries the resolver's
  own message in `scraperError`. It also reports the resolved endpoint and where
  the key is placed, because "right key, wrong URL for this plan" is the failure
  this rung actually has and no amount of vendor naming reveals it.
- The presets are now genuinely optional. They save typing for ten vendors and
  are not the boundary of what the app supports.
- Canonicalisation can in principle collide: two vendors whose names reduce to
  the same letters would resolve to whichever has the preset. None of the ten do,
  and `SCRAPER_ENDPOINT` overrides the result regardless, so the cost of a
  collision is bounded by a variable an operator already has.
- Reducing names loses information deliberately. A typo like `scrapreapi` is not
  a preset and, with no endpoint set, is refused — which is the intended
  behaviour and the reason rule 3 stays.
