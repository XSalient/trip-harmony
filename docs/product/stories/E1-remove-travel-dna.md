# E1 — Remove Travel DNA

- **Covers request items:** 1
- **Status:** Done
- **Depends on:** nothing

## Why

Travel DNA asks every member to rate themselves 1–10 on eight abstract axes
(budget comfort, social energy, adventure level, planning style, cultural
curiosity, comfort need, food priority, activity pace) before they can be scored
against anything. It is a quiz standing between a person and the trip they came
to plan, and the answers are self-reported personality rather than anything
actionable about a specific trip. The per-trip preferences feature
(`memberPreferences`) already collects what the AI actually needs — must-haves,
strong preferences, avoids — in the member's own words, about the trip in front
of them.

Removing it is subtraction only, which is why it goes first: it shrinks the
surface every later epic has to work on.

## Stories

### E1.1 — As a new member, I am not asked to complete a personality quiz, so that I can get to the trip immediately

**Acceptance criteria**

- [x] `/quiz` no longer resolves; visiting it renders the 404 page.
- [x] No link, card or CTA anywhere in the app points at the quiz.
- [x] The profile page renders without a Travel DNA section and without a gap
      where it was.
- [x] The home page renders for a user who never took the quiz and for one who
      did, identically.

**Touches**

- `client/src/App.tsx:8,29` — the import and the `/quiz` route.
- `client/src/pages/TravelDnaQuiz.tsx` (214 lines) — delete.
- `client/src/lib/travelDna.ts` — the eight axis definitions shared by the quiz
  and the profile. Delete.
- `client/src/pages/Profile.tsx` — remove the DNA section and its query.
- `client/src/pages/Home.tsx` — remove the quiz CTA.
- `client/src/components/MobileNav.tsx` — the bottom-nav "DNA" tab.

**Notes**

`Profile.tsx` is described in the repo map as "the account screen: Travel DNA,
password, passkeys, sign out". Update that line in
`docs/architecture/repo-map.md` when the section goes.

**Found during implementation:** this list originally missed
`MobileNav.tsx`, which had a permanent bottom-nav tab pointing at `/quiz` — a
dead link on every authenticated screen, not a page anyone had to visit. The
list was built by grepping for `travelDna`, and that tab referenced only the
route string. **Later epics: grep for the route path as well as the symbol.**

Two removals were replacements rather than deletions, because a hole would have
read as a bug:

- The landing page's four-card feature grid would have dropped to three in a
  two-column layout. Travel DNA's card became **Trip Preferences**, which is the
  feature that actually replaced it.
- The dashboard's two-button Quick Actions row would have left "New Trip"
  beside a gap; it is now a single full-width button.

### E1.2 — As a developer, the API and database carry no Travel DNA, so that nothing reads a table that no longer means anything

**Acceptance criteria**

- [x] `server/routers/travelDna.ts` is deleted and its line removed from
      `server/routers/index.ts`.
- [x] `upsertTravelDna`, `getTravelDna` and `getGroupTravelDna` are gone from
      `server/db.ts`, and no caller remains.
- [x] The `travelDna` table, its `TravelDna` / `InsertTravelDna` types and its
      import are gone from `drizzle/schema.ts`.
- [x] `drizzle/0002_drop_travel_dna.sql` drops the table, and
      `drizzle/meta/_journal.json` records it.
- [x] `pnpm check` and `pnpm test` pass.

**Touches**

- `server/routers/travelDna.ts` (35 lines) — delete.
- `server/routers/index.ts` — remove the import and the router key.
- `server/db.ts:381-437` — `upsertTravelDna`, `getTravelDna`,
  `getGroupTravelDna`; also drop the `travelDna` import at the top of the file.
- `drizzle/schema.ts:108-126` — the table and its types.
- `drizzle/0002_drop_travel_dna.sql` — new migration.
- `server/wevotrip.test.ts` — references Travel DNA. Update the
  affected tests rather than deleting them; the coverage they give the
  surrounding behaviour still matters.

**Notes**

The owner confirmed a full drop, data included. Keep the `DROP TABLE` in its own
migration file so it can be held back from a deploy independently of the code
change if anyone gets cold feet. Follow the procedure in
`docs/runbooks/database.md` — deployed environments use versioned migrations, not
`drizzle-kit push`.

### E1.3 — As a group, the AI still gives useful answers once DNA is gone, so that removing a feature does not quietly degrade another

**Acceptance criteria**

- [x] `runAccommodationMatchAnalysis` builds member profiles from trip
      preferences alone; no prompt text mentions Travel DNA or its axes.
- [x] A member with no saved preferences still gets a neutral score rather than
      being omitted from `memberMatches`.
- [x] `referee.analyze` sends a context object with no `dnaStats` key, and the
      referee's replies still name a concrete tension.
- [x] Running the referee on a trip with proposals and votes returns advice that
      references something real about that trip.

**Touches**

- `server/routers/matchAnalysis.ts:25-108` — the `Promise.all` fetches
  `getGroupTravelDna`; `memberProfiles` builds a `dna` object; `profileText`
  prints a "Travel DNA —" line and a "Travel DNA: not set" fallback. All go.
  The prompt at `:110-135` names Travel DNA twice.
- `server/routers/referee.ts:26,38-56,58-72` — the `getGroupTravelDna` call, the
  `dnaFields` / `dnaStats` computation, and the `dnaStats` key in
  `contextSummary`.

**Notes**

This is the one part of E1 that is not pure subtraction. The referee's context
object is currently `{tripName, phase, memberCount, dnaStats, totalBudget,
perPerson, destinationCount, accommodationCount, vetoCount}`. Take out
`dnaStats` and most of its structured signal is gone, leaving it to comment on
counts. Replace it with data the app already has and that says more about actual
disagreement:

- **Member preferences** — `db.getAllTripPreferences(tripId)` returns every
  member's must-haves, avoids and comments. This is the direct replacement for
  DNA and is what the match analyser already uses.
- **Vote spread per proposal** — how split the group is on each option, and which
  proposals nobody has voted on. `getDestinations` / `getAccommodations` /
  `getDateProposals` already return votes.
- **Members who have not voted** — the concrete blocker on most stalled trips.

Budget figures stay as they are.

## Open questions

None. The owner confirmed the full removal including the table drop.

## Out of scope

- The per-trip preferences feature (`memberPreferences`, `preferences` router,
  `TripPreferences.tsx`) stays. It is a different thing that happens to feed the
  same AI.
- Renaming or restructuring the match analysis output. E4 changes _when_ it runs,
  not what it says.
