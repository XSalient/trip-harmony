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

Three environment variables, served to the pages by `system.support`:

| Variable             | What it needs                                               |
| -------------------- | ----------------------------------------------------------- |
| `LEGAL_ENTITY`       | The company or person operating the service                 |
| `LEGAL_JURISDICTION` | Whose law governs, and where disputes are heard             |
| `LEGAL_ADDRESS`      | A postal address — required by GDPR Article 13 and by Apple |

Configuration rather than constants, so filling them in is a Doppler edit rather
than a rebuild and a release — a placeholder that ships to production is the
failure mode here, and one that can only be fixed by a code change ships for
longer. Unset, the pages render a visible `[LEGAL ENTITY NAME]` rather than an
empty gap, because a policy that silently omits the operator reads as finished.
`client/src/pages/legal.test.ts` fails if a page hardcodes one instead.

`GET /api/health` reports `legal: "configured"` once all three are set.

The date at the top of each page (`LEGAL_UPDATED` in `LegalPage.tsx`) stays in
code: it moves when the wording changes, so it belongs beside the wording.

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

### 4. Set up the subscription products

In App Store Connect and the Play Console, then in RevenueCat: create the
product, attach it to an entitlement, and point the webhook at
`https://<your-domain>/api/billing/webhook` with `REVENUECAT_WEBHOOK_SECRET` as
its Authorization header. `/api/health` reports `billing: "configured"` once the
secret key is set.

Under the Small Business Program the commission is 15% while you are below $1M
a year, on both stores. It is not automatic on Apple's side — you have to
enrol.

### 5. Answer the questionnaires honestly

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
- Billing: a free account organises one trip at a time, sold through Apple's and
  Google's in-app purchase. The purchase sheet itself is wired when the
  Capacitor wrap lands — there is no in-app purchase on the web — so until then
  the paywall explains the limit and points at the apps.
- A privacy policy and terms at `/privacy` and `/terms`, reachable **without an
  account** — a reviewer opening that URL is signed out, which is why those
  pages never call `useAuth` and a test enforces it.

---

## Still to build

- **The Capacitor wrap.** Two things in this repository need changing for it:
  `server/_core/cookies.ts` issues a `SameSite=None` session cookie that iOS
  drops in a WebView, so the session JWT has to travel as a bearer token
  instead; and `server/routers/passkeys.ts` derives `rpID` from the request
  `Host`, which is `localhost` there, so passkeys need a native plugin plus
  association files.

## Values needed before the wrap can be finished

Held only by the account owner. All four are declared as environment variables
already, so filling them in needs no code change:

| Variable                   | Where it comes from                                      |
| -------------------------- | -------------------------------------------------------- |
| `APPLE_TEAM_ID`            | The Apple Developer account, e.g. `A1B2C3D4E5`           |
| `IOS_BUNDLE_ID`            | Chosen when the app record is created                    |
| `ANDROID_PACKAGE_NAME`     | Usually the same string as the iOS bundle                |
| `ANDROID_CERT_FINGERPRINT` | `keytool -list -v -keystore <file>`, colon-separated hex |

With Play App Signing, the fingerprint Android App Links verify against is the
one **Play re-signs with**, not the upload key's — take it from the Play Console,
not from your local keystore.

None of these are secret; every one is readable from a shipped app. They are
here because the `apple-app-site-association` and `assetlinks.json` files are
built from them, and universal links and passkeys stay broken until they are
real. `/api/health` reports `nativeIds`.

## A known gap, unrelated to the stores

CI's "Schema and migrations agree" step does not currently do anything. The
drizzle snapshots in `drizzle/meta/` stop at `0007` while migrations run past
`0017`, so `pnpm db:generate` hits an interactive prompt, writes nothing, and
`git diff --quiet` passes vacuously. Migrations are still exercised — CI applies
them to a scratch Postgres with `pnpm db:deploy` — but the guard against a
column added to `schema.ts` with no migration is not working. Regenerating the
missing snapshots is its own piece of work.
