# Launching on the app stores

Everything that has to happen before Back To Travelling is on the App Store and
Google Play, in the order that unblocks the most, and who can do each part.

**The code is done.** What is left is accounts, settings, a lawyer, a Mac and a
phone — none of which anyone can do without your credentials.

---

# The checklist

## 1. Open the two developer accounts

- **Apple Developer Program** — $99/year, at developer.apple.com. Approval takes
  a day or two.
- **Google Play Console** — $25, once, at play.google.com/console.
- In App Store Connect, sign the **Paid Applications Agreement** and fill in
  banking and tax details. This blocks any paid release and can take days.
- **Enrol in the Small Business Program while you are there.** It halves Apple's
  commission from 30% to 15% below $1M a year. It is not automatic — people miss
  it and pay double for a year. Google's equivalent is automatic.

## 2. Fill in thirteen settings

**None of these exist in Doppler yet — you create each one.** They are declared
in `server/_core/env.ts` and `.env.example`, which is code; Doppler is a separate
system and does not learn about them from the repository. So an empty Doppler
config is the expected state, not a sign that something went wrong.

Nothing breaks while a variable is absent: `env.ts` defaults every one of them
to empty, and each switches on the feature it belongs to when you set it. Add
them as you get the values rather than creating thirteen blanks now.

The quickest way is the bootstrap script, which prompts for each in turn and
skips any you press Enter on:

```bash
bash scripts/doppler-bootstrap.sh dev    # then stg, then prd
```

Or add them by hand in the Doppler UI, or with
`doppler secrets set NAME --project trip-harmony --config dev`. Either way they
also need to reach Vercel — see [secrets.md](secrets.md).

**Needed to submit at all:**

| Variable             | What it needs                                   |
| -------------------- | ----------------------------------------------- |
| `SUPPORT_EMAIL`      | An address people can write to                  |
| `LEGAL_ENTITY`       | Your company, or your own name                  |
| `LEGAL_JURISDICTION` | e.g. "England and Wales"                        |
| `LEGAL_ADDRESS`      | A postal address — GDPR Article 13 requires one |

Until these are set, `/privacy` and `/terms` show a visible `[LEGAL ENTITY NAME]`
rather than an empty gap, because a policy that silently omits the operator reads
as finished when it is not.

**Needed for links and passkeys to work in the apps:**

| Variable                   | Where it comes from                          |
| -------------------------- | -------------------------------------------- |
| `APPLE_TEAM_ID`            | Your Apple account, e.g. `A1B2C3D4E5`        |
| `IOS_BUNDLE_ID`            | You choose it, e.g. `com.yourname.btt`       |
| `ANDROID_PACKAGE_NAME`     | Usually the same string                      |
| `ANDROID_CERT_FINGERPRINT` | **The Play Console** — see the warning below |

> **Take the Android fingerprint from the Play Console, not from your own
> keystore.** With Play App Signing, Google re-signs your app, so the certificate
> App Links verify against is theirs and not your upload key's. Getting this
> wrong means links quietly open the browser instead of the app, with no error
> anywhere — the file is perfectly valid, it just describes a different app.

**Needed to take payment:**

`REVENUECAT_SECRET_KEY`, `REVENUECAT_WEBHOOK_SECRET`, `VITE_REVENUECAT_IOS_KEY`
and `VITE_REVENUECAT_ANDROID_KEY`, all from the RevenueCat dashboard. Leave
`BILLING_ENABLED` empty — empty means on.

**Check they took:** open `https://<your-domain>/api/health`. It should report
`supportEmail`, `legal`, `nativeIds` and `billing` as `configured`.

## 3. Have a lawyer read two pages

`/privacy` and `/terms` are written and live, drawn from what the code actually
does — every claim traces to a table in `drizzle/schema.ts` or a call in
`server/`.

**They are a draft, not legal advice.** Ask whoever reviews them to look hardest
at two things:

- The app sends trip content to Google's Gemini, including member names, their
  recorded preferences and their budget limits — the referee's prompt is built
  from them (`server/prompts/referee.ts`).
- The app stores ages for attendees who are not users, including children, who
  cannot consent for themselves.

The date at the top of each page (`LEGAL_UPDATED` in `LegalPage.tsx`) stays in
code, because it moves when the wording moves.

## 4. Set up the subscription

- Create the subscription product in App Store Connect and in the Play Console.
- In RevenueCat, attach it to an entitlement.
- Point RevenueCat's webhook at `https://<your-domain>/api/billing/webhook`, with
  `REVENUECAT_WEBHOOK_SECRET` as its Authorization header.

## 5. Build the apps (needs a Mac)

`ios/` and `android/` are not in this repository — generating them needs Xcode
and the Android SDK.

```bash
pnpm build
npx cap add ios && npx cap add android   # once only
npx cap sync                             # after every pnpm build
npx cap open ios                         # or: npx cap open android
```

**Commit `ios/` and `android/` once they exist.** They carry the icons, the
splash screens and the signing configuration, and regenerating them loses all
three.

## 6. Two settings that cannot be written in code

They are Xcode and Gradle settings:

- **iOS**: add the Associated Domains capability, with **both**
  `applinks:<your-domain>` and `webcredentials:<your-domain>`. Without the
  second, passkeys created in the app are not offered on the website.
- **Android**: add the `intent-filter` for `<your-domain>` with
  `android:autoVerify="true"` in `AndroidManifest.xml`.

## 7. Test on a real phone

None of these can be checked any other way, and each is a likely first bug:

- Sign in, close the app completely, reopen it — are you still signed in?
- Tap a magic link from your email — does the app open, or the browser?
- Drag a member between families on the Members screen.
- Buy the subscription with a sandbox account, then tap **Restore purchases**.

## 8. Submit

Answer the questionnaires honestly:

- **Privacy nutrition labels / Data safety.** Declare what the privacy policy
  names: Google Gemini, the email provider, the optional page-fetching service
  and the hosting platform.
- **AI disclosure and age rating.** The referee generates text shown to users;
  both stores now ask.
- **Age.** The terms set a floor of 13.

**Expect one rejection.** It is normal. The two likeliest reasons — guideline 1.2
(user-generated content) and 4.2 (minimum functionality, which webview wrappers
attract) — are both already handled.

---

# Already done, so you do not have to

- **In-app account deletion**, required by Apple since 2022, with the trip
  handover it implies: an organiser's trips pass to another member rather than
  taking the group's planning with them.
- **Guideline 1.2's four requirements**: a submission-time content filter, a
  report mechanism, blocking, and a published contact address.
- **A privacy policy and terms** at `/privacy` and `/terms`, reachable **without
  an account** — a reviewer opening that URL is signed out, which is why those
  pages never call `useAuth` and a test enforces it.
- **Billing**: a free account organises one trip at a time; being invited is
  always free. Sold through the stores' own in-app purchase, with the purchase
  sheet and restore-purchases wired.
- **The native shell**: Capacitor config, the session as a bearer token, the
  association files, deep links, the Android back button, safe-area insets,
  status bar, keyboard and splash screen.

# Still to do on the code side

- **Passkeys inside the apps.** The server already expects both origins: the
  web's, and Android's `android:apk-key-hash:…` derived from
  `ANDROID_CERT_FINGERPRINT`. iOS needs nothing extra — an app associated
  through `webcredentials` presents the domain's own origin.

  What is missing is a **native WebAuthn bridge on the client**:
  `@simplewebauthn/browser` calls the WebView's own API, whose origin is
  `capacitor://localhost` and will not match. Password and magic-link sign-in
  work regardless, so this can follow the first release rather than block it.

- **Whatever device testing turns up.** The bearer-token session and the deep
  links are the two most likely to need a round or two, because both fail in
  ways only a real phone reveals.

# A known gap, unrelated to the stores

CI's "Schema and migrations agree" step does not currently do anything. The
drizzle snapshots in `drizzle/meta/` stop at `0007` while migrations run past
`0018`, so `pnpm db:generate` hits an interactive prompt, writes nothing, and
`git diff --quiet` passes vacuously. Migrations are still exercised — CI applies
them to a scratch Postgres with `pnpm db:deploy` — but the guard against a column
added to `schema.ts` with no migration is not working. Regenerating the missing
snapshots is its own piece of work, and worth doing before anyone relies on that
check.
