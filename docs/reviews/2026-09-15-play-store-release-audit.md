# Pre-submission audit — Google Play, 15 September 2026

An adversarial pass over the app as a reviewer, tester and auditor would run it,
rather than as its authors would demo it. Everything below was reproduced
against a real instance: Postgres 16, `pnpm db:push`, `pnpm seed:demo`,
`pnpm dev`, driven in headless Chromium under a Pixel 5 profile (393 px) and
through the tRPC API with real session cookies.

**Verdict: do not submit yet.** Three items block the Play Console forms
outright — one of which, B1, was already fixed on another branch and closed
when both merged; and five more are the kind of thing that shows up in the first week of
one-star reviews. The engineering underneath is better than most apps at this
stage — authorisation is genuinely airtight, and the documentation is unusually
honest — which is why the gaps below are worth fixing rather than shipping around.

## How to read this

| Mark                  | Meaning                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Confirmed**         | Reproduced end to end against a running instance. Steps included.                                                  |
| **By inspection**     | Established from code that has one unambiguous reading.                                                            |
| **Not testable here** | Needs a device, a store account, or a key this container does not have. Listed so it is not mistaken for "passed". |

`pnpm verify` is green: typecheck, the full vitest suite, and the production
build all pass. None of the findings below are caught by it, which is the point
of running a pass like this one.

---

# Blockers

## B1. There is no account-deletion web URL — Confirmed, and since fixed

Google Play's User Data policy requires two things of any app that lets people
create an account. The in-app path exists (`Profile → Delete my account`, and
`Privacy.tsx` documents exactly what it erases — genuinely one of the better
deletion disclosures I have read). The second requirement is a **web link where
a user can request account and data deletion without reinstalling the app or
signing in**. It is a mandatory field in the Data safety form and it is rendered
on the store listing.

No such route exists. `client/src/App.tsx` has `/privacy` and `/terms` as the
only unauthenticated pages, and `/privacy` says "Profile → Delete my account,
**from inside the app**" — which is precisely the answer the policy exists to
rule out.

**Fix:** a public `/delete-account` route explaining the in-app path _and_
offering a way to request deletion by writing to `SUPPORT_EMAIL`, reachable
signed out, then paste that URL into the Data safety form.

Source: [Understanding Google Play's app account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)

> **Closed on merge, 2026-09-15.** This was written without sight of
> `claude/app-store-launch-checklist-cij6lr`, which had already added a
> signed-out `/delete-account` route and the test in `legal.test.ts` that keeps
> it reachable without an account. Both branches merged to `master` on the same
> day, so the finding lands closed. Kept here because the reasoning still
> explains why the field matters, and because the audit should read as it was
> taken rather than as it turned out.

## B2. A third-party dev tool is compiled into the shipped bundle — Confirmed

`dist/public/index.html` is **369 KB**. Almost none of that is the app.
`vite-plugin-manus-runtime` inlines a second React runtime plus its own
element-selector and preview overlay directly into the HTML of every page, and
it is in the **unconditional** plugin array in `vite.config.ts:199` — not gated
on `command === "serve"` or on mode. The injected script opens with:

```js
<script id="manus-runtime">window.__MANUS_HOST_DEV__ = false;
```

It knows it is a production build and injects anyway. I also observed it writing
a `manus-runtime-user-info` key into `localStorage` during an ordinary browser
session.

Shipping this means: 369 KB of blocking inline script before first paint on every
cold launch inside the WebView, and third-party code with full DOM access inside
a binary Google scans, in an app whose privacy policy carefully enumerates every
other party that receives anything.

**Fix:** gate it — `...(command === "serve" ? [vitePluginManusRuntime()] : [])` —
and the same for `vitePluginManusDebugCollector()`. Then re-check
`wc -c dist/public/index.html`.

## B3. `LEGAL_ADDRESS` is empty — Confirmed (already known)

`docs/runbooks/launch.md` already tracks this and the reasoning there is correct:
GDPR Article 13 requires a postal address, `config.legal.isComplete` needs all
three values, and `/privacy` shows a visible `[LEGAL ENTITY NAME]` until it is
set. Repeated here only so the blocker list is complete. It is waiting on
business registration, which also gates the developer accounts.

---

# High severity

## H1. The vote counter can exceed its own denominator — Confirmed

A date proposal renders **"5/4 voted"**, and opening "Who voted" shows a
**phantom voter with no name, labelled "Member"**.

The two halves of the fraction are computed by different rules:

- Denominator — `getTripVoterCount` (`server/db.ts:1712`) filters
  `m.role !== "watcher"`.
- Numerator — `votedCount={totalVotes}` where
  `const totalVotes = p.votes?.length || 0` (`client/src/pages/TripDates.tsx:593`).
  Every row, whatever the voter's role.

So a watcher holding a vote row is counted in the numerator and excluded from the
denominator. `VotedCount.tsx`'s own doc comment claims "watchers are in neither
mode's count" — the denominator honours that, the numerator never did. The same
`votes.length` pattern is used on Suggestions, Accommodations and Budget.

**This is reachable with no database tampering.** `trips.updateMemberRole`
(`server/routers/trips.ts:526`) changes the role and nothing else — a member who
has voted and is later demoted leaves their rows behind. Reproduced entirely
through the public API as the trip admin:

```
trips.get        → voterCount = 4
trips.updateMemberRole {tripId:1, userId:5, role:"watcher"} → success
trips.get        → voterCount = 3
UI /trips/1/dates → "4/3 voted"   "4/3 voted"   "5/3 voted"
```

The "Who voted" dialog is worse than the number, because `getProposalVoters`
(`server/db.ts:~1860`) maps over every row but resolves names only against
`accepted` non-watchers — so the watcher's name comes back `null` and the UI
falls back to the literal string `Member`.

Note the same function _already_ gets this right for the other half: it dedupes
groups and excludes watchers when building the "still to vote" list. Only the
counter above it was left behind.

**Fix:** derive the numerator from the same rule as the denominator — count
distinct voting units among accepted non-watchers — in one shared place, not in
four page components. Separately, decide what a demotion does to existing votes
and do it in `updateMemberRole`.

## H2. One invisible character defeats the content filter — Confirmed

`shared/moderation.ts` is the mechanism the launch runbook cites as satisfying
the UGC requirement. It handles the evasions it was designed for — `F.U.C.K`,
`fuuuuck`, fullwidth, leetspeak — and misses the easiest one available.

Reproduced **through the live API**, each posting successfully as a comment:

| Payload                                | Result     |
| -------------------------------------- | ---------- |
| `fuck`                                 | blocked ✅ |
| `f<U+200B>uck` (zero-width space)      | **stored** |
| `f<U+200C>uck` (zero-width non-joiner) | **stored** |
| `fu<U+00AD>ck` (soft hyphen)           | **stored** |
| `fu<U+0441>k` (Cyrillic es)            | **stored** |
| `wh<U+03BF>re` (Greek omicron)         | **stored** |
| `f🙂uck` (emoji)                       | **stored** |

Every one of these renders on screen **identically** to the string that was
blocked.

The cause is visible in `normaliseForFilter`'s own output. An unrecognised
character is replaced with a **space**, splitting the word, and the rule that
rejoins split words only fires for runs of **three or more single letters**
(`findBlockedTerm`). `f.u.c.k` → `f u c k` → four singles → rejoined → caught.
`f<ZWSP>uck` → `f uck` → a one-letter run beside a three-letter token → never
rejoined → passes.

**Fix:** two lines in `normaliseForFilter`. Strip `\p{Cf}` (format characters:
ZWSP, ZWNJ, soft hyphen) and combining marks by **deleting** them rather than
turning them into spaces, and fold confusable Latin/Cyrillic/Greek homoglyphs
before matching. Both belong before the existing pipeline, not after.

The architecture around it is right — `withContentFilter` in
`server/_core/trpc.ts` applies to every mutation via an allowlist of field names,
so new routers inherit it. Two caveats worth knowing: it only inspects
**top-level string** fields, so nested objects and arrays are unfiltered; and a
prose field whose name is not in `USER_TEXT_FIELDS` is silently unguarded.

## H3. Every tripmate can read every other member's private budget cap — Confirmed

The Preferences screen says, verbatim, next to the field:

> **My budget cap** — EUR 1500 — _Yours alone — nobody else on the trip sees it._

That is not true. `trips.members` returns `budgetMax` for every member to any
tripmate. As Hannah, an ordinary tripmate with no special role:

```
Ava Bennett        budgetMax = 1500.00   role = admin
Marcus Oyelaran    budgetMax = 1800.00   role = admin
Priya Raghunathan  budgetMax = 1200.00   role = tripmate
Tomás Ferreira     budgetMax = 2000.00   role = tripmate
Dev Mehta          budgetMax = 1600.00   role = tripmate
```

The same payload carries every member's email address.

The redaction in `projectMembersForRole` (`server/routers/_shared.ts`) is
**watcher vs. everyone else**, not **self vs. others**. Watchers are correctly
stripped — I verified that separately, including that `groups.attendees` returns
`age: null` for a watcher and `age: 9` for an admin, exactly as
`PROJECT_STATUS.md` claims. The bug is that "tripmate" was treated as
"trusted with everything".

Nothing in the UI _renders_ another member's cap, so this is a payload-level
exposure rather than something on screen. It is still wrong three ways at once:

1. The app tells the user the field is private. It is not.
2. `/privacy` under "Who else sees it" says members see "proposals, votes,
   comments and who made them" — caps and emails are not in that list.
3. It is the most sensitive field in the product. The whole point of the number
   is "what I can afford without resenting it".

**Fix:** project `budgetMax` (and arguably `email`) to `null` for anyone who is
not the member themselves or a trip admin. If the intent really is that
tripmates see each other's caps, then the Preferences copy and the privacy policy
both have to change instead — but that would undercut the feature.

## H4. No rate limiting anywhere on the auth surface — Confirmed

`grep -rn "rateLimit|throttle|attempts" server/` returns nothing.

**Credential stuffing.** 60 wrong-password attempts against one account from one
connection:

```
attempts=60   rate-limited=0   elapsed=3051ms     (~20 guesses/second)
```

Compounded by `auth.register` accepting `password` and `12345678` — the only
rule is an 8-character minimum.

**Email bombing a third party.** `auth.requestMagicLink` is public, accepts any
address, and does not check that the address has an account. Twenty requests to
`victim@example.com` produced **twenty send attempts** (log-only here; twenty
real emails in production). The token table is fine — it upserts, so one row —
but the sends are unbounded. That is an abuse vector aimed at people who have
never heard of this app, and the practical consequence is the Resend account
suspended and `wevotrip.com` on a blocklist.

**Fix:** a per-IP and per-account limiter on `auth.login`, `auth.register` and
`auth.requestMagicLink`. Given Vercel serverless, an in-memory limiter will not
hold across instances — the token table or a small `auth_attempts` table is the
honest option.

Two smaller things in the same file:

- `verifyPassword` compares with `derived.toString("hex") === key` — a
  non-constant-time comparison where `crypto.timingSafeEqual` belongs. Remotely
  exploiting this is close to infeasible; fixing it is one line.
- `express.json({ limit: "50mb" })` applies to every endpoint, including the
  unauthenticated auth ones.

## H5. The error boundary prints a raw stack trace to the user — Confirmed

`client/src/components/ErrorBoundary.tsx:38` renders
`{this.state.error?.stack}` inside a `<pre>`, with **no environment gate**. Any
client-side crash shows the end user a wall of minified stack frames under "An
unexpected error occurred."

I hit this by navigating with the network down and got:

```
An unexpected error occurred.
TypeError: Failed to fetch dynamically imported module: …/TripDashboard.tsx
Reload Page
```

`AGENTS.md` rule 5 says "Errors to clients: never leak a stack trace." The server
honours that carefully — `clientSafeMessage` in `server/_core/trpcErrors.ts` is
well-built and correctly keys on `config.onDeployedPlatform` rather than
`APP_ENV`, which I verified. The client does not honour it at all.

**Fix:** show the stack only when `import.meta.env.DEV`; otherwise an apology, a
request id, and the reload button.

---

# Medium severity

## M1. A family member's vote is silently overwritten — Confirmed

One-vote-per-group is implemented correctly on the server:
`applyGroupVoteExclusivity` deletes a groupmate's row before the caller's upsert,
and it returns the displaced user ids. Signed in as Marcus (The Kellys) on the
group-voting trip, I tapped **Yes** on a proposal where his groupmate Ava had
already voted **No**. Ava's row was deleted and replaced. The data is right.

The experience is not. Marcus was shown a **completely blank ballot** on a card
that simultaneously read **"4/4 voted"** — no indication that his family had
already voted, no indication of what it voted, and no warning that tapping would
replace it. Ava is never told: `displaced` is written to the activity trail and
**nothing else** — no notification, no return value to the client, nothing on
screen.

For an app whose landing page promises "nobody quietly resentful", a mechanism
that silently overwrites your partner's vote and tells neither of you is the
wrong failure mode. It is also a plausible source of "the app changed my vote"
reviews, which are very hard to answer.

**Fix:** show the family's current vote as the selected state on the ballot,
attributed ("The Kellys voted No — Ava, 20 Aug"), and confirm before replacing
it. Notify the displaced member. The server already computes everything needed.

## M2. 14 MB of assets, and the largest file is an Emacs Lisp highlighter — Confirmed

`dist/public/assets` is **14 MB across 466 files**. The twenty largest:

```
872K  TripReferee.js        608K  wasm.js            180K  typescript.js
764K  emacs-lisp.js         444K  mermaid.core.js    176K  jsx.js
708K  index.js              436K  cytoscape.esm.js   172K  tsx.js
612K  cpp.js                324K  treemap.js         168K  objective-cpp.js
                            260K  wolfram.js         148K  architectureDiagram.js
```

Roughly 2.9 MB is plainly Shiki language grammars and Mermaid diagram renderers;
96 files match diagram-related names alone.

The cause is `streamdown`, used in exactly two places — `TripReferee.tsx` and
`AIChatBox.tsx` — to render the AI referee's prose. It is a Markdown renderer
built for AI **coding** assistants, so it drags in a full syntax-highlighting
engine and a diagram library. The referee writes sentences about who can manage
stairs. It will never emit Emacs Lisp or a Gantt chart.

These are lazy chunks, so they are not fetched at runtime — but all 14 MB ships
inside the APK, and download size is the single biggest lever on install
conversion.

**Fix:** configure Streamdown to a minimal language set with Mermaid off, or
replace it with a small Markdown renderer. Either should remove several MB.

## M3. Google Fonts is fetched from Google's CDN on every launch — Confirmed

`client/index.html:65-68` preconnects to `fonts.googleapis.com` /
`fonts.gstatic.com` and loads Inter and Plus Jakarta Sans from Google at runtime.
I watched the request fire on every page load.

Two consequences:

- **Privacy.** Every launch sends every user's IP address to Google. `/privacy`
  has a careful "Who else sees it" section naming Gemini, the email provider, the
  page-fetching service and the host. The font CDN is not in it. That omission is
  more conspicuous _because_ the rest of the list is so thorough, and it is the
  exact arrangement a German court ruled on in 2022.
- **Reliability.** A network-dependent font in a WebView means a fallback-font
  flash — or a reflow — on a slow connection, on the first screen a reviewer sees.

**Fix:** self-host both families (`@fontsource/*` or the woff2 files in
`client/public/`). It removes a third party, removes a network dependency from
first paint, and makes the privacy policy correct again without editing it.

## M4. No Content-Security-Policy — Confirmed

No CSP header or meta tag anywhere: not in `server/_core/app.ts`, not in
`vercel.json`, not in `client/index.html`. No `helmet` either.

For a WebView shipping user-generated content and rendering AI output through a
Markdown pipeline, a CSP is the cheap defence-in-depth that limits the blast
radius if any of it is ever wrong.

**Fix:** a restrictive `default-src 'self'` policy. Self-hosting fonts (M3) and
dropping the Manus runtime (B2) both remove obstacles to a strict one.

## M5. The page scrolls sideways on a phone — Confirmed

At 393 px (Pixel 5), **9 of 18 routes** have `scrollWidth > clientWidth`:

| Route                                                        | scrollWidth / clientWidth |
| ------------------------------------------------------------ | ------------------------- |
| `/privacy`                                                   | 411 / 393                 |
| `/terms`                                                     | 405 / 393                 |
| `/`                                                          | 405 / 393                 |
| `/trips/1/settings`, `/notifications`                        | 400 / 393                 |
| `/trips/new`                                                 | 398 / 393                 |
| `/trips/1`, `/trips/1/dates`, `/profile`, `/trips/1/referee` | 394–396 / 393             |

18 px of horizontal scroll is small enough to read as jank rather than a bug,
which is worse — it makes the whole app feel loose. `/privacy` and `/terms` are
the two pages a store reviewer opens first.

## M6. Touch targets below Android's minimum, several at 12×12 px — Confirmed

Material's accessibility guidance sets 48×48 dp, and **Play Console's
pre-launch report runs an accessibility scan that flags this automatically** —
so these will come back as findings attached to your first release whether or not
anyone files a review.

Measured in the live DOM:

| Screen               | Control                                 | Size        |
| -------------------- | --------------------------------------- | ----------- |
| Members              | "Remove Ines Kelly", "Leave The Kellys" | **12 × 12** |
| Budget / Preferences | "Not this one" (dismiss suggestion)     | 24 × 24     |
| All proposal screens | unlabeled button                        | 28 × 28     |
| Trip settings        | section toggle                          | 32 × 18     |
| Trip page            | "Trip actions", "Trip members"          | 36 × 36     |
| Dates                | "Unlock"                                | 65 × 28     |

The 12 × 12 remove buttons are on the Members screen, next to each other, and are
destructive.

**Fix:** keep the icons, expand the hit area — a transparent `::before` inset of
`-12px`, or `p-3` on the button with a smaller icon inside.

## M7. Controls with no accessible name — Confirmed

Found by walking the DOM for interactive elements with no text, `aria-label` or
`title`:

- Trip page: `BUTTON.-m-1 flex size-10 …` — no name
- Every proposal screen: a 28 × 28 button with an empty label
- Trip settings: the section toggle switch
- Members, New trip: an `<input>` and a `<textarea>` with no associated label

TalkBack announces each of these as "button", unlabelled. Same pre-launch report,
same automatic finding.

---

# Low severity

| #   | Finding                                                | Detail                                                                                                                                                                                                                                                                          |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | Trivial passwords accepted                             | `password` and `12345678` both register. Only an 8-char minimum.                                                                                                                                                                                                                |
| L2  | Blank trip names accepted                              | `"     "` and three zero-width spaces both create a trip. `z.string().min(1)` without `.trim()`.                                                                                                                                                                                |
| L3  | No cap on trip description                             | A 100 KB description was accepted and is rendered on the home screen card.                                                                                                                                                                                                      |
| L4  | Arbitrary currency codes accepted                      | `currency: "XXX"` stored, though the UI offers a fixed list of seven.                                                                                                                                                                                                           |
| L5  | Null byte → 500                                        | `"ab\0cd"` as a trip name reaches Postgres and raises an unhandled error. Should be a 400 from Zod. Production correctly shows "Something went wrong" rather than the SQL — the leak I saw locally is dev-only and properly gated.                                              |
| L6  | Duplicate heading                                      | "Good morning, Ava" appears twice in the accessibility tree on the home screen.                                                                                                                                                                                                 |
| L7  | Mixed English                                          | "Compare accommodations and vote on your **favorites**" — US spelling amid _finalised_, _analyse_, _organise_ everywhere else.                                                                                                                                                  |
| L8  | Dead chunks shipped                                    | `PreviewSeed` is emitted into `dist/public/assets` although the route is `import.meta.env.DEV`-gated. The gate works — the route is unreachable — but the chunk is dead weight.                                                                                                 |
| L9  | `pnpm start` with `APP_ENV=development` serves nothing | The bundled server takes the Vite-dev path and 500s on `/home/user/client/index.html`. Only affects the long-running entrypoint, not Vercel — but `PROJECT_STATUS.md` records production as running `APP_ENV=development`, so it is a live trap for anyone containerising this. |

---

# What passed

Worth recording, because these are the things that usually fail.

- **Authorisation is airtight.** Every cross-trip probe was refused. A user on
  trip 3 could not read trip 1's members, groups, dates, suggestions,
  accommodations, budget, comments or voter lists, could not vote on it, and
  could not comment on it — including when addressing objects by bare proposal
  id rather than trip id. A watcher could not vote. A tripmate could not change
  roles or delete the trip. Error codes were specific and correct throughout.
- **No credential leakage.** No payload readable by any role carried a password,
  hash, salt, session token or credential column. `toPublicUser` holds.
- **Watcher redaction works.** Ages come back `null` for a watcher and populated
  for an admin; `budgetMax` is nulled across the board for a watcher. The claim
  in `PROJECT_STATUS.md` is accurate.
- **Server-side error masking works and is correctly gated.** `clientSafeMessage`
  keys on `config.onDeployedPlatform`, not `APP_ENV`, so a deployment that
  mis-sets `APP_ENV` cannot re-expose raw errors. The magic-link URL is likewise
  logged only when not on a deployed platform.
- **One-vote-per-group is correct in the data**, across all four vote tables.
- **Target API level is fine.** Capacitor 8.5 defaults `compileSdk`/`targetSdk`
  to **36** and `minSdk` to 24, which meets the requirement that came into force
  on 31 August 2026 — the deadline has already passed, so this would otherwise
  have been a hard blocker.
  ([target API level requirements](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en))
- **`pnpm verify` is green** — typecheck, full test suite, production build.
- **Input length validation** is present and sensible where it exists (name ≤ 100
  on register, ≤ 255 on trips) with readable messages rather than schema dumps.
- **The written policy pages are good.** `/privacy` and `/terms` are specific,
  traceable to the schema, and reachable signed out. The deletion section in
  particular is more honest than most commercial policies. H3 and M3 are
  corrections to them, not a verdict on them.

---

# Not testable in this environment

Listed so none of it is mistaken for having passed.

- **Everything in `android/`.** The directory does not exist, by design
  (`capacitor.config.ts` explains why). So: `AndroidManifest.xml`, the declared
  permissions, the App Links intent filter and `autoVerify`, Play App Signing,
  the release signing config and the generated icon set are all unaudited. The
  manifest Capacitor generates is the one that ships unless someone edits it.
- **In-app purchase.** RevenueCat is unconfigured (`billing: "missing"` at boot).
  Purchase, restore, entitlement enforcement and the webhook are untested. The
  free-tier gate (one organised trip) could not be exercised.
- **The AI referee.** No `AI_ENABLED` key, so no live output. Two things worth
  attention when you can test it: prompt injection — the referee's prompt is
  built from member names, preferences and comments, all attacker-controlled —
  and what Streamdown does with hostile Markdown, since it is the only Markdown
  renderer in the app and it renders model output directly.
- **Offline behaviour in the WebView.** Not characterisable from the dev server,
  which re-fetches modules over HTTP by design. In Capacitor the bundle is local,
  so the real question is what a trip screen looks like when chunks load and the
  API does not. Needs a device.
- **The bearer-token session, deep links and passkeys** — all three fail only in
  ways a real phone reveals. `docs/runbooks/launch.md` §7 already says so and is
  right.

---

# Suggested order

1. **B2** — one line in `vite.config.ts`. Removes 369 KB and a third party.
2. **H2** — two lines in `normaliseForFilter`. The filter currently misses the
   easiest evasion there is.
3. **H5** — gate the stack trace on `import.meta.env.DEV`.
4. **H3** — project `budgetMax` per-viewer, or change the copy. Either way stop
   the app making a false privacy claim.
5. **H1** — one shared rule for both halves of the fraction.
6. ~~**B1** — a public `/delete-account` page.~~ **Done** — shipped by
   `claude/app-store-launch-checklist-cij6lr`, merged the same day.
7. **H4** — rate limits. The magic-link half is urgent because it harms people
   who are not your users.
8. **M3, M4** — self-host fonts, then add a CSP; they unblock each other.
9. **M6, M7** — tap targets and labels, before the pre-launch report reports them
   for you.
10. **M2** — trim the Markdown renderer.
11. **B3** — `LEGAL_ADDRESS`, whenever registration completes.

`M1` is not on that list because it is a product decision, not a defect. It is
the finding I would most want the product owner to look at.
