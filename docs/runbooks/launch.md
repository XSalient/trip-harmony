# Launching on the app stores

What has to be true before Back To Travelling can be submitted to the App Store
or Google Play, and who can do each part. Written during the Capacitor
conversion; see the CHANGELOG entries from 2026-08-28 onwards for what has
landed.

The short version: **the code is not the hard part.** Store compliance is, and
most of what is left on this page cannot be done by anyone without an Apple or
Google account.

---

## Blockers — a submission will be rejected without these

### 1. Fill in the operator's details

`client/src/components/LegalPage.tsx` exports a `LEGAL` constant holding four
values that ship as visible placeholders:

| Field          | What it needs                                               |
| -------------- | ----------------------------------------------------------- |
| `entity`       | The company or person operating the service                 |
| `jurisdiction` | Whose law governs, and where disputes are heard             |
| `address`      | A postal address — required by GDPR Article 13 and by Apple |
| `updated`      | Bump when the policy text changes substantively             |

They live in one file on purpose: `client/src/pages/legal.test.ts` fails if a
placeholder appears anywhere else, because the one that gets scattered is the
one that ships still saying `[JURISDICTION]`.

**These pages are a draft, not legal advice.** They were written from what the
code actually does — every claim traces to a table in `drizzle/schema.ts` or a
call in `server/` — but somebody qualified should read them before they are
published, particularly the sections on children's data and on what leaves the
system for Google's Gemini API.

### 2. Set `SUPPORT_EMAIL`

Apple's guideline 1.2 requires published contact information for an app with
user-generated content. Set it in Doppler (`dev`, `stg`, `prd`) and in Vercel;
see [secrets.md](secrets.md).

Check it took: `GET /api/health` reports `supportEmail: "configured"` or
`"missing"`. The privacy and terms pages say support is unavailable while it is
missing, rather than rendering a `mailto:` that goes nowhere.

### 3. Store accounts and agreements

Nobody but the account holder can do these.

- Apple Developer Program — $99/yr.
- Google Play Console — $25 once.
- The paid applications agreement, plus banking and tax details, in App Store
  Connect. This can take days to clear and blocks any paid release.

### 4. Answer the questionnaires honestly

- **Privacy nutrition labels / Data safety.** Declare the third parties the
  privacy policy names: Google Gemini, the email provider, the optional
  page-fetching service, and the hosting platform. Note that member names,
  recorded preferences and budget caps reach Gemini — the referee's prompt
  builds from them (`server/prompts/referee.ts`).
- **AI disclosure and age rating.** The referee generates text shown to users.
  Both stores now ask about this.
- **Age.** The terms set a floor of 13. The app also stores ages for attendees
  who are not users, including children — worth raising with whoever reviews
  the policy.

---

## Already done

- In-app account deletion (Apple has required this since 2022), with the trip
  handover it implies.
- Guideline 1.2's four requirements: a submission-time content filter, a report
  mechanism, blocking, and a contact address once `SUPPORT_EMAIL` is set.
- A privacy policy and terms at `/privacy` and `/terms`, reachable **without an
  account** — a reviewer opening that URL is signed out, which is why those
  pages never call `useAuth` and a test enforces it.

---

## Still to build

- **Billing.** Digital features mean Apple IAP and Play Billing are mandatory
  (15% under the Small Business Program, 30% above $1M/yr). Commission on a
  real-world booking would be exempt and could go through Stripe at ~3% — worth
  settling before the schema is written, because it changes it.
- **The Capacitor wrap.** Two things in this repository need changing for it:
  `server/_core/cookies.ts` issues a `SameSite=None` session cookie that iOS
  drops in a WebView, so the session JWT has to travel as a bearer token
  instead; and `server/routers/passkeys.ts` derives `rpID` from the request
  `Host`, which is `localhost` there, so passkeys need a native plugin plus
  association files.

## Values needed before the wrap can be finished

Held only by the account owner:

- Apple Team ID
- The iOS and Android bundle identifiers
- The Android signing keystore's SHA-256 fingerprint

The `apple-app-site-association` and `assetlinks.json` files can be written with
placeholders, but universal links and passkeys will not work until these are
real.

## A known gap, unrelated to the stores

CI's "Schema and migrations agree" step does not currently do anything. The
drizzle snapshots in `drizzle/meta/` stop at `0007` while migrations run past
`0017`, so `pnpm db:generate` hits an interactive prompt, writes nothing, and
`git diff --quiet` passes vacuously. Migrations are still exercised — CI applies
them to a scratch Postgres with `pnpm db:deploy` — but the guard against a
column added to `schema.ts` with no migration is not working. Regenerating the
missing snapshots is its own piece of work.
