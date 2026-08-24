# 0020. A preference is offered as a proposal, never turned into one

- Status: Accepted
- Date: 2026-08-24

## Context

My Preferences is four free-text boxes. They fed AI accommodation match scoring
and nothing else, so somebody who wrote "we can do about £1,200 a family" had
stated the trip's most contested number in the one place nobody votes on, and
would never be asked about it again. The same for dates.

Three questions had to be answered together.

**Who acts?** Creating a proposal notifies the whole trip and casts an implicit
vote. Doing that as a side effect of somebody editing a textarea spends the
group's attention rather than earning it, and a typo becomes a notification
nobody can recall.

**What reads the text?** A model reads prose better than a regular expression
does. But [E4](../product/stories/E4-ai-runs-on-request-only.md) established
that AI on this app runs because a person asked for it, and `aiLimits.test.ts`
holds `preferences.ts` to containing no model call at all — saving preferences
used to re-analyse every accommodation on the trip, so a six-member group
filling in a form spent six full passes over the same stays. A parse fired by
Save would be the same mistake in a new place: a paid request per save, from a
form.

**What stops it repeating?** A suggestion that reappears on every save is a
prompt people learn to dismiss unread.

## Decision

**Detect, then confirm.** Saving offers what you wrote back as proposals, each
card quoting the sentence it came from; a tap makes it real, through the
existing `dates.propose` and `budget.create`, so a converted preference is an
ordinary proposal with the implicit vote and the notification those already
handle. There is no second way to create one.

**Detection is deterministic and free.** No model runs on save, so E4's rule
holds.
`shared/suggestions.ts` is pure, tested on literal fixtures, and
`aiLimits.test.ts` now holds `suggestions.ts` to the same no-`invokeLLM` rule as
`preferences.ts`. A "look harder" pass behind an explicit tap remains open, in
that file, where the rule can be stated separately for it.

**It is conservative, deliberately asymmetric.** A missed suggestion costs
nothing; a wrong one costs the trust that makes anybody read the next. So:

- A figure is money only when the sentence marks it as money — a symbol, a
  currency code, or a word like "budget" nearby. "No more than 10 stairs" and
  "minimum 3 attached bathrooms" are numbers in the same boxes, and both are
  real text from the form's own placeholders.
- **Places are not detected at all.** Prose does not yield place names
  reliably — "Airbnb", "Tuesday" and "Ground floor" all read as proper nouns —
  and this is the part a model does well. It waits for the model.
- **The dealbreakers box is never read.** "Nothing over £2,000" is a limit;
  proposing it inverts what the person said.

**Suppression is by fingerprint, and only refusals are stored.** A suggestion
that becomes a proposal suppresses itself, because its fingerprint is then among
the trip's — computed with the same normalisation `dates.propose` and
`budget.create` already use for their duplicate checks. Accepting therefore
needs no record at all. Declining leaves no trace without one, so
`suggestion_dismissals` exists for that alone.

## Consequences

`server/routers/suggestions.ts` is its own domain rather than part of
`preferences.ts`: it emits proposals across several domains, and preferences
would end up owning rules that are not its own.

**The budget cap stays private and stays a cap.** Nothing here changes
`projectMembersForRole` or `budget.summary`'s `votersOverCap`. The cap is
offered as a proposal to its owner alone, with a scope picker defaulting to
per-family for somebody in a family, because a cap is a share and not a total —
and the summary card now says in a line that the cap is theirs and a proposal is
the group's.

`kind` on `suggestion_dismissals` is a plain varchar, not an enum: it is an
internal key, never rendered, and a new kind of suggestion should not need an
`ALTER TYPE` and the migration constraints that come with one.
