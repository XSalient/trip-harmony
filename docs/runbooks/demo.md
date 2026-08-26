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

Send marketing the URL — **https://demo.backtotravelling.com**. Done.

To reset it later — after a prospect has clicked around, or before recording —
an app admin does it from the app itself, in one click and with no terminal:
**Profile → Admin → Reset demo data**. See _Resetting it after it has been
clicked about_ below.

The command still works and replaces the demo rather than duplicating it, which
is what you want when nobody is an app admin yet or the deployment has no
`DEMO_SEED_PASSWORD`.

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
| **Nina**, Watcher      | The plan only. No votes, no proposers, no comments, no AI referee      |

Take **Ava** for screenshots — every screen is one tap away. The three seats
side by side are also the clearest way to explain the permission model: same
trip, and the app visibly gives each person less. Nina's screens carry one line
saying why the buttons are missing, so "watcher" reads as a role rather than as
a broken page.

Switching seats is safe to do on camera: taking a new seat empties the cached
data first, so Nina never opens on Ava's trips.

The button only appears when a demo has been seeded, so an unseeded deployment
shows nothing rather than a dead end.

**If you want them to experience being invited**, send a join link instead.
They register with their own email and land as a real member — which also
captures their address:

| Link                                                   | They arrive as                                   |
| ------------------------------------------------------ | ------------------------------------------------ |
| `/join/DEMO-LISBON`                                    | Tripmate on the hero trip — voting as themselves |
| `/join/DEMO-CHAMONIX?invite=demo-chamonix-nina-invite` | Watcher, through the emailed-invite path         |

Visitors who signed up through a join link keep their own accounts, and just
follow the link again after a reset.

### Resetting it after it has been clicked about

Sign in as an app admin, go to **Profile → Admin → Reset demo data**, confirm.
It takes about a second, and puts the three trips back exactly as they were
seeded — every vote, comment and finalised accommodation a visitor left behind
is discarded.

No terminal, no network requirements, from any device you can sign in on. This
is the way to do it before a call. The command line still works and is the only
option when nobody is an app admin yet; see _Seeding a shared environment_.

The Admin section is gated on **who you are, not which host you used** — so it
is there on `www` as well, which is where you sign in. It rebuilds the one demo
either way, because both domains are the same deployment reading the same
database.

### Signing in with a password instead

Still works, for a seat the picker does not offer — `marcus@`, `tomas@`,
`hannah@`, `dev@`, `yuki@` and the rest, all at
`demo.backtotravelling.example`, sharing the password the seeder printed.

## What you get

**Lisbon & the Algarve** — the hero. Seven people, mid-argument, in the
accommodation phase. Dates decided, two suggestions finalised, one stay booked.
Nina, who has stated no preferences at all, has voted **go with the majority**
on two of the proposals — worth nothing in the tally, and visible as an answer
rather than as a blank row. An eighth person, Joel, has a pending invite that
came from importing a saved family, so the trip already carries an **Abaras**
group with his seven-year-old in the headcount and nobody in it who has
accepted yet.

**Chamonix, before the season ends** — five people, nine days old, still
picking dates. Nobody is free in the same week. One declined invite, two
pending. Ben has abstained on the only unblocked range, and the referee's
summary says out loud that an abstention is not a yes. This is what a new group
actually looks like.

**Kyoto in the autumn** — finished and archived. Everything finalised, budget
settled €135 a head under. Use it to demo cloning a trip.

## The shots worth taking

Ordered by how well they sell the product.

| Screen              | Path                             | What is on it                                                                                                         |
| ------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **AI Referee**      | `/trips/<lisbon>/referee`        | Five messages: a nudge, two mediations, a compromise, a celebration. The accommodation mediation is the best of them. |
| **Accommodations**  | `/trips/<lisbon>/accommodations` | Five stays scored 86, 79, 64, 41 and one deliberately un-analysed. Two flagged high resentment risk.                  |
| **Budget Guardian** | `/trips/<lisbon>/budget`         | €7,579 across five categories, and a live "1 member over their budget limit" alert.                                   |
| **Members**         | `/trips/<lisbon>/members`        | Three roles, three saved families, an invite carrying the group it imported into, the share link.                     |
| **Dates**           | `/trips/<lisbon>/dates`          | Three ranges, one decided; a vote someone changed their mind on.                                                      |
| **Suggestions**     | `/trips/<lisbon>/suggestions`    | Two finalised, one vetoed four times, one argued into a compromise.                                                   |
| **Trip dashboard**  | `/trips/<lisbon>`                | Everything summarised, including "1 unvoted proposal" and "6/7 members submitted".                                    |
| **My Preferences**  | `/trips/<lisbon>/preferences`    | Ava's four boxes, and the €1,400 she wrote in them offered straight back as a proposal she can put to the group.      |
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
of `server/demo/story.ts` — replace it wholesale if you have licensed
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

### Making someone an app admin

App admin is `users.role`, and is not the same as being an admin **on a trip** —
that is a per-trip role on the members page, and it grants nothing here. Only an
app admin sees the Admin button and only an app admin can call the reset.

There is no UI for granting it, on purpose: it is rare, and it is the one role
that can rebuild the demo. Promote an account with one statement against the
database:

```sql
update users set role = 'admin' where email = '…';
```

The button then appears on that person's Profile the next time they load the
app.

### Giving the deployed server the demo password

The button rebuilds the demo on the server, so the **server** needs
`DEMO_SEED_PASSWORD` — a password that is missing, under 8 characters, or the
one published in this file is refused, and the reset says so by name rather than
failing quietly.

Having it in Doppler is not enough, and this is the part that catches people out.
`trip-harmony/demo` is the config that carries the password, and it syncs
nowhere. The one Doppler → Vercel sync that exists runs from a different config
and lands in **Production** only. So the password reaches no deployment until
someone puts it there.

Add it in Vercel, scoped to **Production**, reading the value from Doppler:

```bash
doppler secrets get DEMO_SEED_PASSWORD --plain --project trip-harmony --config demo
```

Then redeploy. Vercel injects environment variables at build and boot, so a
deployment that already exists will not pick the new one up.

One caveat: the sync rewrites the Production set wholesale, so a variable added
by hand can be removed again by a later sync run. If the button starts refusing
after having worked, this is why — and the durable fix is to put the password in
the config that feeds the sync, identifiable in the Doppler dashboard as the one
carrying a Vercel integration. Vercel marks synced values _Sensitive_, so they
cannot be read back from its UI to identify the source.

### Two domains, one deployment

`demo.backtotravelling.com` and `www.backtotravelling.com` are the **same
build**, the same server and the same database. What separates them is the
hostname the request arrived on:

|                                              | `demo.`   | `www.`      |
| -------------------------------------------- | --------- | ----------- |
| **See a real trip** on the landing page      | shown     | hidden      |
| Seat picker (`auth.demoSignIn`)              | works     | `NOT_FOUND` |
| `/join/DEMO-LISBON` and the other demo links | works     | works       |
| Everything else                              | identical | identical   |

This is why the demo cannot drift from the product: there is no second branch
and no second build to keep in step. It also means **the demo has to be gated on
the hostname rather than on configuration** — one process serves both domains,
so both see the same environment variables, and only the `Host` header differs.
`isDemoTourHost` in `shared/demo.ts` is that check, and it treats any `demo.`
subdomain and `localhost` as the demo's.

The seat picker applies the rule itself, so hiding the button is presentation
rather than protection: calling the API directly from the product host answers
exactly as an unseeded deployment would.

Join links are deliberately **not** gated. A prospect who was sent
`/join/DEMO-LISBON` should land in the trip whichever host they open, and they
join as themselves rather than as a persona.

**Previews need `DEMO_TOUR_ENABLED=true`.** A preview URL is generated per build,
so no hostname rule can recognise one. Set it on _All Pre-Production
Environments_ to keep testing the demo there. It is opt-in on purpose: forgetting
it hides a demo, whereas the opposite mistake puts one on the marketing site.

**Passkeys do not work on the demo subdomain.** The relying-party ID comes from
`PUBLIC_BASE_URL`, so a browser on `demo.` refuses with `'rp.id' cannot be used
with the current origin`. Nothing in the demo needs them — the seat picker asks
for no credential — but it will look like a bug to whoever meets it. Fixing it
means setting the relying-party ID to `backtotravelling.com`, which covers every
subdomain, and re-enrolling every existing passkey, since a passkey is bound to
the ID it was created under.

### The `demo` Doppler config

`trip-harmony/demo` carries a full set of app secrets plus `DEMO_SEED_PASSWORD`,
a generated password that is not the published one. To seed the database that
config points at, from a machine with network access to it:

```bash
doppler run --project trip-harmony --config demo -- pnpm seed:demo --allow-production
```

There is no `--password` argument: the seeder reads `DEMO_SEED_PASSWORD`, which
`doppler run` has already put in the environment. That is what keeps this one
line identical on Windows, macOS and Linux — no `sh -c`, no `%VAR%`, no quoting
to get wrong — and it keeps the password out of your shell history and out of
the package runner's log.

`--project` is not optional. `doppler.yaml` binds this repository to the `dev`
config, and a personal CLI login carries no project of its own, so `--config
demo` alone fails with "You must specify a project". A service token carries
both and needs neither flag — which is why this command can look fine to
whoever wrote it and break for the next person.

The password never has to be typed or pasted — it comes out of Doppler and goes
straight into the flag. `--clean` on the same command removes the demo again.

`PUBLIC_BASE_URL` here reads `https://demo.backtotravelling.com`, which is where
the demo is served from — see _Two domains, one deployment_ below.

**This cannot be run from a Claude Code web session.** That sandbox reaches the
network through an HTTPS proxy that does not carry raw-TCP database connections,
so `DATABASE_URL` times out there no matter which config is loaded. Seeding is a
job for a developer machine or CI. Everything else about the demo — the code,
the config, the deployment — is reachable from a web session.
