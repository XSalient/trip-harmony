# Running the marketing demo

Three trips, eleven people and a live argument, for screenshots, a screencast,
or a link to send a prospect.

Why it exists and why it is built this way:
[ADR-0015](../adr/0015-demo-data-lives-in-its-own-namespace.md).

---

## Setup — a developer, once, five minutes

Seed the deployment marketing will use. After this nobody needs a terminal
again.

```bash
pnpm seed:demo --allow-remote     # against the preview/demo deployment's DATABASE_URL
```

Send marketing the deployment URL. Done.

To reset it later — after a prospect has clicked around, or before recording —
run the same command again. It replaces the demo rather than duplicating it.

Locally instead of a deployment: `pnpm seed:demo && pnpm dev`, then
http://localhost:5000.

---

## Everyone else — two clicks, nothing typed

This is the whole process, and it is the same for marketing, for a prospect on
a call, and for a business owner you sent the link to:

1. Open the URL.
2. Click **See a real trip**.
3. Pick a seat.

No email, no password, no sign-up form.

| Seat                   | What they see                                                          |
| ---------------------- | ---------------------------------------------------------------------- |
| **Ava Bennett**, Admin | All three trips. Can finalise, invite, change roles — the full product |
| **Priya**, Tripmate    | The Lisbon trip. Votes and comments, but the finalise buttons are gone |
| **Nina**, Watcher      | The plan only. No votes attributed, no proposers, no AI referee        |

Take **Ava** for screenshots — every screen is one tap away. The three seats
side by side are also the clearest way to explain the permission model: same
trip, and the app visibly gives each person less.

The button only appears when a demo has been seeded, so an unseeded deployment
shows nothing rather than a dead end.

**If you want them to experience being invited**, send a join link instead.
They register with their own email and land as a real member — which also
captures their address:

| Link                                                   | They arrive as                                   |
| ------------------------------------------------------ | ------------------------------------------------ |
| `/join/DEMO-LISBON`                                    | Tripmate on the hero trip — voting as themselves |
| `/join/DEMO-CHAMONIX?invite=demo-chamonix-nina-invite` | Watcher, through the emailed-invite path         |

Re-run the seeder when the demo has been clicked about. Visitors who signed up
keep their own accounts and just follow the link again.

### Signing in with a password instead

Still works, for a seat the picker does not offer — `marcus@`, `tomas@`,
`hannah@`, `dev@`, `yuki@` and the rest, all at
`demo.backtotravelling.example`, sharing the password the seeder printed.

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

### The `demo` Doppler config

`trip-harmony/demo` carries a full set of app secrets plus `DEMO_SEED_PASSWORD`,
a generated password that is not the published one. To seed the database that
config points at, from a machine with network access to it:

```bash
doppler run --config demo -- sh -c \
  'APP_ENV=production pnpm seed:demo --allow-production --password="$DEMO_SEED_PASSWORD"'
```

The password never has to be typed or pasted — it comes out of Doppler and goes
straight into the flag. `--clean` on the same command removes the demo again.

**This cannot be run from a Claude Code web session.** That sandbox reaches the
network through an HTTPS proxy that does not carry raw-TCP database connections,
so `DATABASE_URL` times out there no matter which config is loaded. Seeding is a
job for a developer machine or CI. Everything else about the demo — the code,
the config, the deployment — is reachable from a web session.
