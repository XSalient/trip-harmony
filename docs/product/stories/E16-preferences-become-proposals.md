# E16 — Preferences become proposals

- **Status:** Done
- **Depends on:** E4 (the rule that AI runs when asked), E12 (budget scopes)
- **Decision:** [ADR 0020](../../adr/0020-preferences-suggest-proposals.md)

## Why

My Preferences was a dead end. The four boxes fed AI accommodation match scoring
and nothing else, so somebody who wrote "we can do about £1,200 a family" had
stated the trip's most contested number in the one place nobody votes on, and
would never be asked about it again.

## The rule

**Detect, then confirm.** Detection is deterministic, free, and deliberately
conservative — a missed suggestion costs nothing, a wrong one costs the trust
that makes anybody read the next. Accepting goes through the existing create
mutations, so a converted preference is an ordinary proposal.

## Stories

### E16.1 — What I wrote is offered back as something the group can vote on

- [x] Saving re-reads the suggestions; each card quotes the sentence it came
      from.
- [x] **Propose** calls `dates.propose` / `budget.create` — the implicit vote and
      the notification come from the code that already does both. No second
      creation path.
- [x] Budget cards carry a scope picker, defaulting to per-family for somebody in
      a family, because a cap is a share and not a total.
- [x] Watchers never see the card, and the server refuses them.

### E16.2 — It costs nothing and it is not wrong

- [x] No model call. `aiLimits.test.ts` holds `suggestions.ts` to it as well as
      `preferences.ts`.
- [x] A figure is money only when the sentence marks it as money. "No more than
      10 stairs" and "minimum 3 attached bathrooms" — both from the form's own
      placeholder copy — produce nothing.
- [x] The dealbreakers box is never read: "nothing over £2,000" is a limit, and
      proposing it inverts what the person said.
- [x] Places are not detected at all. Prose does not yield place names reliably,
      and that part waits for the model.
- [x] A month with no year means the next one that has not happened; a month's
      last day is its real one.

### E16.3 — A suggestion does not come back

- [x] Fingerprints use the same normalisation the existing duplicate checks use,
      so accepting one is what stops it being offered — no record needed.
- [x] Declining stores a row, or the same card returns on every save.
- [x] The same text twice produces the same fingerprints.

### E16.4 — The budget cap stays private

- [x] Nothing changes in `projectMembersForRole` or `votersOverCap`.
- [x] The cap is offered as a proposal to its owner alone, and the summary card
      says in a line that the cap is theirs and a proposal is the group's.

### E16.5 — It reads what people actually write (2026-08-25)

The first parser was conservative in intent and wrong in fact: it read a bare
`[A-Z]{3}` beside a number as a currency, and missed most real phrasings.

- [x] A currency code is checked against a closed list. "WE ARE FREE IN MAY 2027"
      and "flight ref ABC 1234" no longer propose a budget — `budget.create`
      takes any three letters, so this reached the group.
- [x] The currency may sit after the figure or be spelled out: "1200 GBP",
      "2000 euros", "1500 usd".
- [x] `pp` glued to a figure is per person, and marks the figure as money on its
      own: "£1200pp", "1200pp".
- [x] Dates: the month before the days ("Sept 12–19"), short month names,
      ordinals, and a month with a year and no preposition ("free JUL 2027"). A
      range and the month containing it are one suggestion.
- [x] Refused: a nightly figure (no scope can hold it), a headcount beside the
      word budget, a day the month does not have, and a range already past.
- [x] The quoted sentence is not cut at a decimal point.
- [x] The budget screen shows the budget suggestions too, and refreshes when a
      cap is saved there — that screen is where the cap is set.

**Touches** — `shared/suggestions.ts` (new), `server/routers/suggestions.ts`
(new) plus one line in `routers/index.ts`,
`drizzle/0014_suggestion_dismissals.sql` (new), `drizzle/schema.ts`,
`server/db.ts`, `client/src/components/trip/ProposalSuggestions.tsx` (new),
`client/src/pages/TripPreferences.tsx`, `PreferencesSummary.tsx`,
`client/src/pages/TripBudget.tsx`.

**Tests** — `shared/suggestions.test.ts` (fixtures, including the numbers that
must _not_ be read as money), `aiLimits.test.ts`.

## Test script

1. Write "We can do about £1,200 a family. Free 12-19 September." in Strong
   Preferences and "Nothing over £9,000 per family" in Avoids, then save.
2. Two suggestions appear, the budget one at `per_group`; the dealbreaker figure
   does not.
3. Propose the budget → a `budget_proposals` row with one `love` vote, and the
   card is gone. Dismiss the date → it does not return on the next save.
