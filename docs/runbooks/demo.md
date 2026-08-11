# Running the marketing demo

Getting from a clone to an app with three trips, eleven people and a live
argument in it — for screenshots, a screencast, or a link to open during a call.

Why it exists and why it is built this way:
[ADR-0015](../adr/0015-demo-data-lives-in-its-own-namespace.md).

## Seed it

```bash
pnpm setup            # once, on a fresh clone
pnpm seed:demo        # against DATABASE_URL
pnpm dev              # http://localhost:5000
```

Through Doppler instead, which is how most people have a database configured:

```bash
pnpm seed:demo:doppler    # doppler run --config dev
pnpm dev:doppler
```

Sign in with any of the seeded accounts. **Ava Bennett** is the one to use — an
admin on all three trips, so every screen is reachable without switching user:

```
ava@demo.backtotravelling.example
demo-tripmate-2026
```

Every other person shares that password: `marcus@`, `priya@`, `tomas@`,
`hannah@`, `dev@`, `nina@`, `joel@`, `sofia@`, `ben@`, `yuki@`, all at
`demo.backtotravelling.example`.

Re-running the seeder resets the demo to its starting state — useful between
takes. `pnpm seed:demo --clean` removes it and creates nothing.

## What you get

**Lisbon & the Algarve** — the hero. Seven people, mid-argument, in the
accommodation phase. Dates decided, two places finalised, one stay booked.

**Chamonix, before the season ends** — five people, nine days old, still
picking dates. Nobody is free in the same week. One declined invite, two
pending. This is what a new group actually looks like.

**Kyoto in the autumn** — finished and archived. Everything finalised, budget
settled €135 a head under. Use it to demo cloning a trip.

## The shots worth taking

Ordered by how well they sell the product.

| Screen              | Path                             | What is on it                                                                                                         |
| ------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **AI Referee**      | `/trips/<lisbon>/referee`        | Five messages: a nudge, two mediations, a compromise, a celebration. The accommodation mediation is the best of them. |
| **Accommodations**  | `/trips/<lisbon>/accommodations` | Five stays scored 86, 79, 64, 41 and one deliberately un-analysed. Two flagged high resentment risk.                  |
| **Budget Guardian** | `/trips/<lisbon>/budget`         | €7,579 across five categories, and a live "1 member over their budget limit" alert.                                   |
| **Members**         | `/trips/<lisbon>/members`        | Three roles, join provenance, a pending invite, the contact picker, the share link.                                   |
| **Dates**           | `/trips/<lisbon>/dates`          | Three ranges, one decided; a vote someone changed their mind on.                                                      |
| **Places**          | `/trips/<lisbon>/destinations`   | Two finalised, one vetoed four times, one argued into a compromise.                                                   |
| **Trip dashboard**  | `/trips/<lisbon>`                | Everything summarised, including "1 unvoted proposal" and "6/7 members submitted".                                    |
| **Home**            | `/`                              | All three trips with their phase badges: Picking Dates, Finding Accommodations, All Set.                              |

The seeder prints each trip's id and path when it finishes.

### The one story to tell

Open the referee on the Lisbon trip and read the accommodation mediation. Ava
needs step-free access after surgery; the group's favourite house is four
floors with no lift and €243 a head cheaper. The referee names the constraint,
prices the disagreement, and refuses to pretend it is a matter of taste. Then
open Accommodations and show the same conflict as numbers — 28/100 for Ava on
the Alfama house, 92/100 on the one they booked.

That is the product. Everything else is a list.

## Watch out for

**The photographs come from Wikimedia Commons.** They are in one map at the top
of `scripts/demo/story.ts` — replace it wholesale if you have licensed
photography, and check the licence terms of any image you publish in an advert
rather than a screenshot. A URL that fails to load costs a photograph, not a
broken card: the app hides a broken image.

Wikimedia only serves thumbnail widths it has already rendered. `960px-` works;
an invented width answers HTTP 400 and the card shows nothing. If you swap a
photo in, load the URL in a browser before you trust it.

**The AI is not called.** Match scores and referee messages are seeded text, so
the demo works with no `AI_INTEGRATIONS_GEMINI_API_KEY` and costs nothing to
run. Pressing **Get Referee Analysis** or **Analyse all** during a demo will
call the real model if a key is configured, and will overwrite the seeded copy
with whatever it says. Don't press them on camera unless that is the point.

**Nothing here is real.** The people are invented, the addresses are at a
reserved `.example` domain that cannot receive mail, and the listing links go
to `example.com`. Keep it that way — a demo seeding plausible Airbnb URLs is a
demo somebody eventually clicks.

## Seeding a shared environment

The seeder writes to whatever `DATABASE_URL` resolves to, so it refuses to run
against anything it was not told about twice:

```bash
# A preview deployment's database
pnpm seed:demo --allow-remote

# Production. Needs a password that is not the published one.
pnpm seed:demo --allow-production --password='…'
```

It only ever deletes rows it created — users whose `openId` starts `demo:` and
trips whose invite code starts `DEMO-`. A database with real trips in it can be
seeded and cleaned without touching them.

Do not seed production with the default password. It is printed in this file
and in `scripts/demo/options.ts`, and the seeder refuses that combination for
exactly that reason.
