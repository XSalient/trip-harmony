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

## Marketing — no setup, no terminal

1. Open the URL.
2. Sign in:
   ```
   ava@demo.backtotravelling.example
   demo-tripmate-2026
   ```
   Ava is an admin on all three trips, so every screen is one tap away.
3. Take the shots in the order below.

That is the whole process. Every other seeded person shares that password —
`marcus@`, `priya@`, `tomas@`, `hannah@`, `dev@`, `nina@`, `joel@`, `sofia@`,
`ben@`, `yuki@`, all at `demo.backtotravelling.example` — if you want to show
the same trip through someone else's eyes. **`nina@` is a Watcher**: sign in as
Nina to show the restricted view, where votes have no names on them.

---

## Prospects — one link, three clicks

Send them the deployment URL. On the landing page they get **"See a real
trip"** next to Get Started. That button only appears when a demo has been
seeded, so it can never lead somewhere empty.

1. **See a real trip** → the Lisbon trip's preview.
2. **Sign in & Join Trip** → they register with their own email.
3. They are in, as a Tripmate, on a trip where six people have already voted,
   argued and been scored by the referee.

They vote and comment as themselves and cannot damage the seeded votes. You get
their email address.

**Send them somewhere specific instead**, by pasting a link directly:

| Link                                                   | They arrive as                                                           |
| ------------------------------------------------------ | ------------------------------------------------------------------------ |
| `/join/DEMO-LISBON`                                    | Tripmate on the hero trip — can vote, comment, set their own preferences |
| `/join/DEMO-CHAMONIX?invite=demo-chamonix-nina-invite` | **Watcher** — sees the plan, but no vote is attributed and no AI referee |
| `/join/DEMO-CHAMONIX`                                  | Tripmate on the early-stage trip, where nothing is decided yet           |

Re-run the seeder when the demo has been clicked about. It removes the demo
trips and the seeded people; visitors who signed up keep their own accounts, so
they just follow the link again.

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
