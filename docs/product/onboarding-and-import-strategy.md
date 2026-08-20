# Onboarding, chat-native growth, and importing plans from other apps

**Status:** strategy brief. Nothing here is committed to; no code has been written
for it. Written 2026-08-11 against the app as it stood then.

> **Read with 2026-08-19 in mind.** The app has since dropped the vibe board and
> the itinerary, and renamed the Places section to Suggestions, on the grounds
> that this is not a travel planner. The argument below still stands on its own
> — the friction it measures is in onboarding, not in those sections — but its
> framing is travel-shaped throughout, and section 5.3 has been corrected where
> it named tables that no longer exist. Re-read section 2 before acting on it.

The ask, in the requester's words, was three things at once:

1. Groups already discuss their trips in WhatsApp and Telegram — make it
   frictionless for them to arrive here.
2. Make that same frictionlessness the marketing engine.
3. Let people who already have plans in Wanderlog, TripIt and friends bring them
   over and see what this app adds.

They are one problem. All three are about the distance between "someone in a
group chat taps a link" and "the group is making decisions here". This brief
measures that distance in the current codebase, then lays out the options.

---

## 1. Where the friction actually is today

Read before proposing anything: every item below was checked against the code,
not assumed.

| #   | Friction                                                                                                                                                                            | Where                                                             | Why it costs users                                                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Invite links have no preview.** `client/index.html` carries no Open Graph or Twitter Card tags, and `vercel.json` rewrites every non-API path to the same `index.html`.           | `client/index.html`, `vercel.json`                                | A `/join/:code` link pasted into WhatsApp renders as a bare blue URL. Nobody taps it. **Every invite this app has ever sent has been marketed this way.**                                         |
| 2   | **Nothing to see before signing up.** `trips.getByInviteCode` is public, but `JoinTrip.tsx` renders only the trip name and description, and `trips.join` is a `protectedProcedure`. | `server/routers/trips.ts:38,272`, `client/src/pages/JoinTrip.tsx` | The invitee is asked to create an account to find out whether the thing is worth an account.                                                                                                      |
| 3   | **No one-tap sign-in.** The deployment offers password, magic link and passkeys.                                                                                                    | `server/routers/auth.ts:133`                                      | Magic link on a phone means leaving the browser for a mail app and coming back — the highest-drop step in any mobile funnel. Passkeys are excellent for _return_ visits, useless for a first one. |
| 4   | **Nothing to install.** No web app manifest, no icons, no service worker.                                                                                                           | `client/`                                                         | The app can only ever be a browser tab. No home-screen icon, and no web push — so nothing ever pulls the group back out of the chat.                                                              |
| 5   | **2.2 MB in one chunk** (585 KB gzipped).                                                                                                                                           | Known gap #2 in `PROJECT_STATUS.md`                               | This is the first paint on mobile data, immediately after a tap in a chat. It is an onboarding problem, not just a performance one.                                                               |
| 6   | **Votes are poll-on-focus, not realtime.**                                                                                                                                          | Known gap in `ROADMAP.md` → "Later"                               | Group decisions happen in bursts of a few minutes. The chat updates instantly; this doesn't.                                                                                                      |
| 7   | **Notifications are in-app only.**                                                                                                                                                  | `server/routers/notifications.ts`                                 | The feed can only be seen by someone who already came back.                                                                                                                                       |

Two things are _already right_ and are the foundation for everything below:

- **The listing-import ladder.** `server/utils/listingSource.ts` resolves a URL
  through paste → page → scraper → place → url, degrading instead of evading
  ([ADR 0008](../adr/0008-listing-import-degrades-instead-of-evading.md),
  [ADR 0013](../adr/0013-optional-scraper-fallback-for-blocked-listings.md)).
  That is exactly the shape a trip importer needs, one level up.
- **The LLM wrapper already accepts PDFs and images** and enforces JSON schemas
  (`FileContent` with `application/pdf`, `OutputSchema` in `server/_core/llm.ts`).
  PDF and screenshot import need no new infrastructure — only a prompt and a
  schema.

---

## 2. Positioning first, because it decides what to build

The instinct behind "let them import from Wanderlog" is right, but the reasoning
has to be right too. **Import is not the value. It is the setup for the value.**

Wanderlog and TripIt are _itinerary organisers for one person's confirmed plan_.
They are good at it and there is no point competing on itinerary depth. What
neither of them does — what nothing mainstream does well — is the part that
actually hurts:

> Seven people, four opinions about dates, two about budget, and nobody wants to
> be the one who decides.

This app already has the assets for that and they are unusual as a set: weighted
voting with the arithmetic exposed, an AI referee that names the conflict, a
Watcher role for the people who need to see but not vote, per-member preferences
feeding match analysis, and finalisation with attribution. **Lead with the
decision layer. Treat the itinerary as the byproduct.**

That reframing pays for itself twice:

- **It removes the switching-cost objection entirely.** You are not asking anyone
  to abandon Wanderlog. "Decide here, keep your itinerary wherever you like" is a
  message competitors structurally cannot answer, and it makes _export back out_
  (§5.4) a feature rather than a leak.
- **It tells you what the import must do in its first five seconds.** Not "your
  trip is now in our database". Rather: _"6 travellers, 3 conflicts — your dates
  clash with Priya's, and two of you are over the budget cap."_ Run the referee
  and the preference matcher on the freshly imported plan and show something the
  source app cannot. An import that ends in a tidy copy of what they already had
  is a wasted acquisition.

---

## 3. Onboarding: the options, ranked by leverage

### Tier 0 — Fix the link itself. Nothing conceptually new; days of work.

**3.1 Server-rendered link previews.** _The single highest-leverage change in
this brief._ When a `/join/:code` URL is fetched by WhatsApp's, Telegram's,
iMessage's or Slack's crawler, return HTML with real Open Graph tags: the trip
name, the destination, "4 of 7 have joined", and a generated image. Mechanically
this is a bot-user-agent branch (or a dedicated route) in `api/server.ts` plus a
`vercel.json` rewrite, because those crawlers do not run JavaScript — static tags
in `index.html` would give every trip the same title.

Worth knowing before building: WhatsApp caps preview image size and is
unforgiving about slow responses, and Telegram caches a preview per URL more or
less permanently — so get the format right before links go out at volume.

**3.2 A real preview before sign-up.** Let the unauthenticated `/join/:code`
screen show the plan the way a Watcher sees it — dates under consideration,
destinations, who is already in — with the personal details already projected out
by the existing role machinery (`_shared.ts`). The sign-up prompt then arrives at
the moment someone wants to _vote_, which is the moment they have a reason to.

**3.3 Google and Apple sign-in.** One tap, no app switch, no inbox detour. On the
auth screen this is almost certainly a larger conversion win than anything else
available, and it does not disturb the existing password/magic-link/passkey
paths — `auth.capabilities` already exists to advertise what a deployment can do.

**3.4 A manifest and icons.** Cheap. Turns the app into something installable,
gives it a home-screen presence, and is the precondition for web push (supported
on iOS only for installed PWAs). Push is what breaks the "the chat notifies me,
the app doesn't" asymmetry in item 7 above.

**3.5 Route-level code splitting.** Already roadmap item 4. Reclassify it as
onboarding work and do it now rather than later: it is the load time of the first
screen a stranger ever sees.

### Tier 1 — Deferred identity (needs a decision and an ADR)

**3.6 Join as a guest, become an account later.** Let someone claim a seat with a
first name, vote immediately, and bind that seat to a real account when they come
back or when something needs to reach them. This is the biggest possible cut to
friction — and it punches straight through `requireTripRole`, the membership
model and the RLS posture of [ADR 0009](../adr/0009-rls-on-with-no-policies.md).
It needs a signed, single-trip-scoped guest token and a member status to match,
and it deserves its own ADR before a line is written.

_Recommendation: do 3.3 first and measure._ One-tap OAuth may close enough of the
gap that guest identity is not worth the security surface. If it does not, build
it deliberately.

### Tier 2 — Meet the group where it already is

This is where the app stops being another destination and starts being part of
the conversation. See §4 — it is the wedge, so it gets its own section.

---

## 4. The chat-native wedge

### 4.1 Import the WhatsApp conversation itself — the strongest idea in this brief

WhatsApp's own "Export chat" produces a plain `.txt` file with every message,
timestamped and attributed. Telegram exports JSON. **Let the group upload that
file, and turn 400 messages of "what about the 12th?" and "my cousin has a place
in Girona" into date proposals, destination suggestions, accommodation
candidates and budget hints — each attributed to the person who said it.**

Why this and not something else:

- It is the _only_ onboarding path where the group's existing work carries over.
  Everything else asks them to start again.
- The input is **the users' own data, voluntarily provided.** No API, no
  partnership, no terms-of-service exposure, no scraping.
- It needs nothing new: the LLM wrapper takes files and enforces JSON schemas
  today, and the extracted objects map onto tables that already exist (§5.3).
- It lands directly on the differentiator. The referee's first output is on real
  arguments the group actually had, in their own words.
- **Nobody else does it.** It is demonstrable in a fifteen-second video, which is
  the whole marketing asset.

**The one serious catch, and it is serious:** a chat export contains every
participant's messages and phone numbers, uploaded by one person who cannot
consent on the others' behalf. This needs an explicit decision before any code:
process and discard rather than store the raw transcript, extract only plan-shaped
facts, say plainly on screen what is being read and what is kept, and set a
retention rule. Treat it with the same seriousness as `toPublicUser()` — get it
wrong and it is the kind of mistake that ends a consumer app.

### 4.2 Share _out_ to the chat, not just in

The group will not abandon WhatsApp, and it is a mistake to try to make them.
Give every screen a "Share to chat" that emits a formatted plain-text block —
current standings, what is still open, the link — that pastes cleanly into
WhatsApp or Telegram. The chat stays the conversation; this app becomes the
scoreboard the conversation keeps pasting. Every paste is a link impression to
people who are not users yet, which makes this a growth loop as much as a
feature.

Pair it with a **decision recap card** — a generated image posted when a proposal
is finalised ("Barcelona + Girona, 12–19 May, decided by 6 of 7"). Shareable to a
chat and to social, and it carries the URL.

### 4.3 A Telegram bot before a WhatsApp one

Telegram's Bot API is free, requires no verification, and can live in the group
chat: poll results posted as they change, `/add <listing url>` reusing the
listing importer that already exists, a nudge when a vote stalls. It is a cheap
experiment that answers an expensive question — _do these groups actually want a
bot, or do they want a link?_ — before committing to WhatsApp.

WhatsApp's Business Platform is where the users are, but it means business
verification, per-conversation pricing, a 24-hour session window and
pre-approved templates outside it. Worth doing **after** Telegram shows the loop
works, not as an act of faith.

---

## 5. Importing existing plans

### 5.1 The ladder, one level up

Do not build one importer per competitor; that is a maintenance treadmill against
sites that change without notice. Build **one ladder, source-agnostic**, exactly
as `listingSource.ts` does for a single listing:

1. **Public share URL** — Wanderlog and TripIt both publish shareable trip pages.
   The existing fetch → parse → (optional scraper) rungs already handle this
   class of problem.
2. **Export file** — PDF (both apps export one), `.ics` (any of them, plus every
   airline and hotel), CSV. Gemini already accepts `application/pdf` through the
   existing wrapper.
3. **Forwarded email** — a unique per-user inbound address
   (`plans+<token>@in.…`). This is how TripIt itself won: users forward booking
   confirmations. It captures Airbnb, Booking, airlines and the competitors'
   own digests in one mechanism, with no integration at all.
4. **Paste** — raw text or a screenshot, same as the accommodation paste box.
5. **Manual** — always the floor.

Each rung runs only because the one above came back empty. The endpoint tells the
client which rung answered, so a half-filled import never claims to be a complete
one — the pattern `accommodations.fetchFromUrl` already follows.

### 5.2 Deliberately _not_ on the list

- **Asking for a user's Wanderlog or TripIt credentials.** Never. Not for import,
  not "just this once".
- **Authenticated scraping of a competitor's account.** Against their terms and
  against [ADR 0008](../adr/0008-listing-import-degrades-instead-of-evading.md)'s
  stated posture, which this repo should not abandon for a growth feature.
- **Assuming a partner API.** TripIt has historically had one, gated by
  partnership; Wanderlog publishes none. Treat any official integration as a
  business-development outcome, not an engineering plan. Verify current terms
  before relying on either.

### 5.3 Where imported things land

The data model already has a home for everything an import produces:

| Source concept            | Table                                          |
| ------------------------- | ---------------------------------------------- |
| Trip / dates              | `trips`, `dateProposals`                       |
| Anything votable          | `destinations` (the Suggestions section)       |
| Hotel / Airbnb booking    | `accommodations` (+ `accommodationAttributes`) |
| Costs, quotes, splits     | `budgetItems`                                  |
| Travellers on the booking | `tripInvites` — pre-fill, do not auto-add      |

`vibeItems` and `itineraryDays` / `itineraryItems` were listed here when this was
written and were dropped on 2026-08-19, so a day-by-day plan now has nowhere to
land. If an import is meant to carry one, that is a table to add, not a table to
reuse — decide it before promising the feature.

**One product decision to make explicitly:** does an imported plan arrive as
_proposals_ or as _finalised_? A booked trip should land finalised — the dates are
real and re-voting them is insulting — with the value-add being everything still
arguable. A wish-list import should land as proposals. Getting this wrong makes
the import feel either presumptuous or pointless.

### 5.4 Export back out

Give `.ics` and PDF export, and deep links back to the other apps. It looks like
handing users an exit; it is the thing that makes the pitch in §2 credible, and
it converts the people who would otherwise never try this at all.

---

## 6. Suggested sequence

Each phase is independently shippable and independently measurable.

**Phase 0 — stop the leak (≈1–2 weeks).** Link previews (3.1), pre-auth trip
preview (3.2), Google/Apple sign-in (3.3), manifest and icons (3.4), code
splitting (3.5). No new concepts, no schema change, no ADR. This fixes the
funnel that every invite already sent has been falling through.

**Phase 1 — the wedge (≈2–3 weeks).** WhatsApp/Telegram chat import (4.1) with
its privacy decision made first, plus share-to-chat and the recap card (4.2).
This is the demo, the differentiator and the marketing asset in one.

**Phase 2 — the import ladder (≈2–3 weeks).** URL, PDF/ICS, email forward, paste
(5.1), landing in the tables at 5.3, ending on a referee/preferences pass rather
than a confirmation screen.

**Phase 3 — stickiness.** Telegram bot (4.3), web push, realtime votes, guest
identity (3.6) if the Phase 0 numbers say it is still needed.

**Phase 4 — reach.** WhatsApp Business Platform, export back out (5.4), public
finished-trip pages as an SEO surface — today the app has essentially none, since
everything worth indexing sits behind auth in a client-rendered SPA.

Phase 0 before Phase 1 is not negotiable: shipping a brilliant chat importer
behind an invite link that renders as a bare URL wastes it.

---

## 7. What to measure

Instrument the funnel _in Phase 0_, or the later phases have no evidence to be
judged on:

- Invite link → preview viewed → account created → joined, as four separate steps.
- **Time to first vote.** The real activation metric; joining is not activation.
- Share-to-chat pastes, and click-through on the links they carry.
- Import started → completed → **a vote cast within 24 hours.** An import with no
  vote after it is a failed acquisition regardless of how well it parsed.
- Invites sent per joined member — the viral coefficient, per trip.

---

## 8. Open decisions

These need answers from the product owner before the phases they belong to:

1. **Chat-export privacy.** Store the raw transcript, or extract and discard?
   What is said on screen, and what is the retention rule? _(Blocks Phase 1.)_
2. **Imported plans: proposals or finalised?** Or decided per source, by whether
   the plan looks booked? _(Blocks Phase 2.)_
3. **Guest identity — worth the security surface,** or is one-tap OAuth enough?
   _(Decide after Phase 0 data, not before.)_
4. **Scraper spend on competitor share pages.** The scraper is a per-request bill
   ([ADR 0014](../adr/0014-scraper-vendor-identity-comes-from-configuration.md));
   is an import allowed to reach that rung, and with what cap?
5. **Which chat platform gets the bot first** — recommendation is Telegram, on
   cost and speed alone.
6. **Does the name lead with the decision?** If the positioning in §2 is right,
   the marketing site and the app's own first screen should say so.

---

## 9. The short version

Fix the link preview and the pre-auth screen before anything else — every invite
already sent has been leaking through them. Then import the group chat itself,
because it is the only onboarding path where the group's existing work carries
over, the only one with no third-party dependency, and the only one competitors
would have to rebuild from scratch. Build one source-agnostic import ladder
rather than one integration per competitor, and make the import end on a conflict
the source app could never have surfaced. Sell the decision layer, not the
itinerary, and let people keep their itinerary wherever they like.
