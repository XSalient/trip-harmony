# The submission answer sheet

Every question the two stores ask, and the answer this codebase supports.

[launch.md](launch.md) is the ordered plan — accounts, configuration, a lawyer,
a Mac. This file is what to type into the forms once you are in front of them,
because the forms are where a submission actually stalls: thirteen Play Console
tasks and about the same number in App Store Connect, most of them a
declaration about the app that only somebody who has read the code can answer
honestly.

**Every answer below is traceable to code**, and says which. Where an answer is
a judgement rather than a fact, it is marked **judgement** and argued rather
than asserted.

> Store policy moves. This was written on 2026-09-14 against what the consoles
> asked for then; check anything marked **verify** against the console in front
> of you rather than trusting this page. What will not have moved is what the
> app does, which is the part this file exists to answer.

---

## 1. What is blocking a submission today

In the order that unblocks the most. The first four are not forms.

| #   | Blocker                                                   | Whose                 | Why it stops everything                                                                                               |
| --- | --------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | **`ios/` and `android/` do not exist**                    | needs a Mac           | There is no binary to upload. `npx cap add ios` runs `pod install`, which is macOS-only — [launch.md §5](launch.md)   |
| 2   | **`LEGAL_ADDRESS` is empty**                              | business registration | `/privacy` and `/terms` render a visible `[POSTAL ADDRESS]`. Both stores open that URL; GDPR Art. 13 requires it      |
| 3   | **`APPLE_TEAM_ID`, `ANDROID_CERT_FINGERPRINT` are empty** | the two consoles      | The association files build, but describe an app that does not exist — deep links open the browser, silently          |
| 4   | **RevenueCat is not configured**                          | RevenueCat + stores   | The paywall falls back to "Nothing to buy just now". An in-app purchase a reviewer cannot complete is a 2.1 rejection |
| 5   | **No reviewer account**                                   | you, 5 minutes        | Nothing but `/`, `/privacy`, `/terms` and `/delete-account` works signed out — see §5                                 |
| 6   | **Play's closed test, if this is an individual account**  | 14 calendar days      | See below. It is the longest pole and nothing in the thirteen tasks mentions it                                       |

**The closed-testing rule is the one that surprises people.** A Play developer
account registered to an individual (not an organisation) after November 2023
must run a closed test with **at least 12 testers opted in for 14 continuous
days** before it may even apply for production access, and the application is
reviewed after that. Start it the day the first build uploads — everything else
on this page can be done while that clock runs. **Verify** which account type
you have in Play Console → Settings → Developer account → Account details; an
organisation account skips this entirely.

---

## 2. The thirteen Play Console tasks

Two are done (privacy policy, merchant account). The rest, with the answer:

| Task                         | Answer                                                  | §   |
| ---------------------------- | ------------------------------------------------------- | --- |
| Set privacy policy ✅        | `https://wevotrip.com/privacy`                          |     |
| Sign in details              | All functionality is restricted → provide credentials   | 5   |
| Ads                          | **No**, the app contains no ads                         | 2.1 |
| Content rating               | IARC questionnaire — answers below                      | 2.2 |
| Target audience              | 13+, not designed for or appealing to children          | 2.3 |
| Data safety                  | The table in §3                                         | 3   |
| Government apps              | **No**                                                  | 2.4 |
| Financial features           | **None of these**                                       | 2.4 |
| Health                       | **No** to every sub-question                            | 2.4 |
| App category + contact       | Travel & Local; `SUPPORT_EMAIL`; `https://wevotrip.com` | 2.5 |
| Store listing                | Copy and assets below                                   | 2.6 |
| Create a merchant account ✅ |                                                         |     |
| Set the price of your app    | **Free**, with in-app purchases                         | 2.7 |

### 2.1 Ads

No. There is no ad SDK in `package.json` and no advertising identifier is read.

One thing to check after `npx cap add android`: the **merged** manifest must not
contain `com.google.android.gms.permission.AD_ID`. Nothing here asks for it, but
a transitive dependency can add it, and its presence contradicts an "no ads"
declaration — Play flags the mismatch at upload. Read it in Android Studio
(Build → Analyze APK, or the Merged Manifest tab on `AndroidManifest.xml`). If
something drags it in, add `<uses-permission
android:name="com.google.android.gms.permission.AD_ID" tools:node="remove" />`.

### 2.2 Content rating (IARC)

The questionnaire is about content, and this app's content is a group arguing
about hotels. Answers:

| Question                                                    | Answer        | Why                                                                                                                                        |
| ----------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Violence, sexuality, language, controlled substances        | **No** to all | The app has no such content of its own                                                                                                     |
| Does the app allow users to interact or exchange content?   | **Yes**       | Comments, proposals, invitations — `server/routers/comments.ts`                                                                            |
| Can users share their location with other users?            | **No**        | No geolocation anywhere in the client; a destination is a typed name                                                                       |
| Can users purchase digital goods?                           | **Yes**       | The subscription, `server/routers/billing.ts`                                                                                              |
| Does the app contain user-generated content that is shared? | **Yes**       | And say so — under-declaring UGC is a re-rating, and a suspension if it looks deliberate                                                   |
| Is there a moderation mechanism?                            | **Yes**       | A submission-time filter (`shared/moderation.ts`), reporting and blocking (`server/routers/moderation.ts`), and an admin queue at `/admin` |

Expect Teen / PEGI 12 or thereabouts. A rating is calculated, not chosen.

### 2.3 Target audience and content

- Target age groups: **13–17 and 18+**. The terms set a floor of 13
  (`client/src/pages/Terms.tsx`).
- "Could your app appeal to children?" — **No**. It plans group travel; there is
  nothing in it aimed at a child.
- Expect a follow-up about children's data. **The honest position, which is not
  the same as the obvious one:** the app has no users under 13, but it _stores
  information about children_ — an adult can add a child as an attendee, with a
  name and an age (`trip_attendees`, `attendeeKindEnum`). That is an adult
  recording their own family's details, not a child using the app, so the
  Families policy does not apply. It is disclosed on `/privacy` under "People
  who are not you", which is where a reviewer will look for it. **Judgement.**
  If you ever let a child sign in, this answer changes and so does the app.

### 2.4 Government, financial, health

All three are "no", and each is worth a sentence so nobody re-opens it:

- **Government apps** — no affiliation with any government body.
- **Financial features** — none. A subscription sold through the store's own
  billing is not a financial product: no lending, no payments between users, no
  crypto, no investment. Budgets in the app are
  [a proposal, not a ledger](../adr/0017-budget-is-a-proposal-not-a-ledger.md) —
  nobody's money moves, and no bank account is ever named.
- **Health** — no health, fitness or medical data of any kind.

### 2.5 Category and contact details

- Category: **Travel & Local**. Tags: travel planning, group, voting.
- Contact email: whatever `SUPPORT_EMAIL` is set to — it must be the same
  address `/privacy` publishes, and it must be monitored, because guideline 1.2
  requires reports to reach a person.
- Website `https://wevotrip.com`, privacy policy `https://wevotrip.com/privacy`.

### 2.6 Store listing

Copy that matches what the app does. Lengths are Play's limits.

- **App name** (30): `WeVoTrip: Plan Trips Together`
- **Short description** (80): `Propose dates, places and stays. Everyone votes. The referee settles the rest.`
- **Full description** (4000): draft below, and say nothing the app does not do —
  a screenshot or a sentence promising a feature that is not there is a content
  rejection on both stores.

```
Planning a trip with friends dies in the group chat. WeVoTrip gives it
somewhere to live.

Propose the dates that work for you. Propose a destination, a place to stay, a
budget. Everyone votes on what they can actually do, and the trip settles one
decision at a time instead of all at once at midnight.

- Dates, destinations, accommodation and budget, each proposed and voted on
- Invite by link or email; people you invite never pay
- Families vote as one, so a couple is not two votes and a toddler is not three
- Record what matters to you — quiet, a pool, a short flight — and see whose
  requirements actually collide
- The AI referee reads the votes and the preferences, names the conflict, and
  suggests the compromise nobody wanted to propose

A free account organises one trip at a time. Being invited is always free.
```

Assets, and where they are:

| Asset              | Requirement                        | Where                                                            |
| ------------------ | ---------------------------------- | ---------------------------------------------------------------- |
| App icon           | 512×512, 32-bit PNG, no alpha      | `resources/generated/store/play-icon-512.png` ✅                 |
| Feature graphic    | 1024×500, no alpha                 | `resources/generated/store/play-feature-graphic-1024x500.png` ✅ |
| Phone screenshots  | 2–8, 16:9 or 9:16, ≥ 320px         | **Still to take** — see below                                    |
| Tablet screenshots | Only if you declare tablet support | Skip: submit phone-only first                                    |

Both images are generated from `resources/icon.png` by `pnpm icons:native` and
committed, so they cannot drift from the app's own icon. The feature graphic is
the mark on its field and nothing else — real, plain, and the obvious thing to
replace when a designer has drawn something.

**Screenshots are the last asset nobody has.** Take them on a real device or an
emulator once the app runs, from a seeded demo trip rather than an empty
account (`pnpm seed:demo`, [demo.md](demo.md)) — an empty app photographs
badly and reads as unfinished to a reviewer. Five that tell the story: the trip
dashboard, dates voting, accommodation with votes in, the preferences screen,
the referee's verdict.

### 2.7 Price

Free, with in-app purchases. The subscription itself is configured in the Play
Console's Monetise → Subscriptions and then attached to an entitlement in
RevenueCat ([launch.md §4](launch.md)).

---

## 3. Data safety (Play) and App Privacy (Apple)

The same facts, asked twice in different words. Both are derived from
`/privacy`, which was written from the schema — if this table and that page ever
disagree, the page is right and this is stale.

| Data                                                        | Collected | Shared | Purpose                               | Where it comes from                                                                        |
| ----------------------------------------------------------- | --------- | ------ | ------------------------------------- | ------------------------------------------------------------------------------------------ |
| Name                                                        | Yes       | No     | Account management, app functionality | `users.name`                                                                               |
| Email address                                               | Yes       | No     | Account management                    | `users.email`                                                                              |
| User IDs                                                    | Yes       | No     | Account management                    | `users.id`, `users.openId`                                                                 |
| Other user-generated content                                | Yes       | No     | App functionality                     | Trips, proposals, comments, preferences, budgets                                           |
| Name and age of non-user attendees                          | Yes       | No     | App functionality                     | `trip_attendees` — entered by an adult about their own party                               |
| Contacts you save                                           | Yes       | No     | App functionality                     | `contacts` — typed in, **not** read from the device address book                           |
| Purchase history                                            | Yes       | No     | App functionality                     | `subscriptions`, written by RevenueCat's webhook                                           |
| App interactions                                            | Yes       | No     | Analytics                             | `product_events`, first-party ([ADR-0024](../adr/0024-first-party-product-measurement.md)) |
| Crash logs, diagnostics                                     | **No**    | —      | —                                     | No crash SDK. Server logs are not device data                                              |
| Location                                                    | **No**    | —      | —                                     | No geolocation call anywhere in the client                                                 |
| Photos, audio, files, contacts on the device, calendar, SMS | **No**    | —      | —                                     | The app asks for no such permission                                                        |
| Advertising ID                                              | **No**    | —      | —                                     | No ad SDK                                                                                  |

And the three declarations that go with it:

- **Encrypted in transit** — yes. HTTPS everywhere, and the native WebView's
  origin is `https://localhost` by configuration (`capacitor.config.ts`).
- **Users can request that their data be deleted** — yes, two ways: in the app
  (Profile → Delete my account) and at **`https://wevotrip.com/delete-account`**,
  which is the URL the form asks for. It works signed out, which is the point:
  the person who needs it has uninstalled the app.
- **Data collection is required, not optional** — you cannot plan a trip
  anonymously.

### The one judgement call: "shared"

Play draws a line between _collected_ (including anything a service provider
processes for you) and _shared_ (transferred to a third party for their own
purposes). Trip content goes to **Google's Gemini**, addresses go to **Resend**,
everything sits on **Vercel** and **Supabase**, and a URL — only a URL — may go
to a **page-fetching service** when a listing import is blocked
([ADR-0013](../adr/0013-optional-scraper-fallback-for-blocked-listings.md)).

Every one of those is a processor acting on our instruction, under contract, not
a party taking the data for itself. **So: collected, not shared.** That is the
defensible answer, and `/privacy` names all four providers so nothing is hidden
by the label. **Judgement** — if you would rather not defend it, declaring them
as _shared_ costs nothing but a line in the listing, and is the safe direction
to be wrong in. What is not safe is declaring neither.

### Apple's version

App Store Connect asks the same questions with different labels, plus one more
that matters:

- **Data used to track you: none.** There is no IDFA, no ad network, no
  cross-app anything — so the app must not show an App Tracking Transparency
  prompt, and if a build ever does, something was added that this table does not
  know about.
- **Data linked to you**: name, email, user ID, user content, purchases,
  identifiers, product interaction.
- **Data not linked to you**: none — everything belongs to an account.
- Apple asks for a privacy policy URL and an optional "privacy choices" URL.
  `https://wevotrip.com/privacy` and `https://wevotrip.com/delete-account`.

---

## 4. App Store Connect, in submission order

1. **Paid Applications Agreement**, banking and tax. Days, not minutes, and it
   blocks any release with a purchase in it. Enrol in the **Small Business
   Program** at the same time: 15% instead of 30%, and it is not automatic.
2. **Bundle id `com.wevotrip.app`**, matching `IOS_BUNDLE_ID`. Permanent after
   the first submission.
3. **Age rating**: no objectionable content, "user-generated content" declared,
   web access **not** unrestricted (the WebView loads this app, not the web).
   Expect 12+ or 13+. Do not claim 4+ with UGC in the app.
4. **App Privacy**: §3.
5. **Subscription**: display name, description, a review screenshot of the
   paywall, and the price. Attach it to an entitlement in RevenueCat before
   submitting, or the reviewer sees an empty paywall.
6. **App Review Information**: demo account (§5), a contact, and notes. Draft:

   ```
   Sign in with the account above — email and password. The app has no
   anonymous mode: every trip belongs to somebody.

   The account already has a trip with members and votes on it, so the voting
   and referee screens have content to show.

   Subscriptions: a free account organises one trip at a time. Tap "New trip"
   with a trip already in progress to see the purchase sheet. Restore
   purchases is on the same sheet.

   Account deletion is at Profile → Delete my account, and also at
   https://wevotrip.com/delete-account without signing in.

   AI: the "Referee" screen generates text with Google Gemini from the trip's
   own votes and preferences, on request only — it never runs on its own. Each
   generated message can be reported from the flag control on the message.
   ```

7. **Export compliance.** The app uses HTTPS and nothing else, which is exempt —
   but Xcode asks on every single upload until you say so in `Info.plist`:

   ```xml
   <key>ITSAppUsesNonExemptEncryption</key>
   <false/>
   ```

8. **Screenshots**: 6.9" iPhone is the required set. **Submit iPhone-only for
   the first release** — set the device family to iPhone in Xcode and you owe no
   iPad screenshots and no iPad review of a layout built for a phone. **Verify**
   the current required sizes in App Store Connect; Apple changes them yearly.

### The guidelines this app actually meets, and where

Worth knowing before a rejection rather than after — each of these is already
handled, and a reviewer who asks deserves a one-line answer:

| Guideline                         | Answer                                                                                                                                        |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **1.2** user-generated content    | Filter (`shared/moderation.ts`), report, block, published contact — all four, `server/routers/moderation.ts`                                  |
| **2.1** completeness              | Demo account with a seeded trip; working purchase                                                                                             |
| **3.1.1** in-app purchase         | The subscription is sold through the store; the web build says so and sells nothing                                                           |
| **3.1.2** subscription disclosure | The paywall states price, period, that it renews and where to cancel, and links Terms and Privacy — `client/src/components/PaywallDialog.tsx` |
| **4.2** minimum functionality     | Not a wrapped website: native session, deep links, purchases, haptics, safe areas, the back button                                            |
| **4.8** login services            | Not triggered — there is no third-party or social sign-in, so Sign in with Apple is not required                                              |
| **5.1.1(v)** account deletion     | In-app, immediate, with the trip handover it implies — `server/routers/auth.ts` `deleteAccount`                                               |

---

## 5. The reviewer account

Both stores need one, and it is the cheapest blocker to clear. It must be a
**password** account: a reviewer cannot read the mailbox a magic link goes to,
and cannot use a passkey on a device they do not have.

1. Register on production with an address you control — `review@wevotrip.com` is
   one you can point at yourself.
2. Set a password on it (Profile → password), so `auth.login` works.
3. Give it something to look at. An empty app reads as unfinished, and a
   reviewer with nothing to tap tests nothing: seed the demo
   ([demo.md](demo.md)), or make a trip, invite two addresses, accept, and vote.
4. Put the same credentials in Play Console → App content → **App access**
   ("All functionality is restricted") and in App Store Connect → **App Review
   Information**.
5. **Do not delete it, and do not let its password rotate.** A reviewer finding
   dead credentials is a rejection with a three-day round trip on it, and it
   happens on updates long after the first release.

---

## 6. Two settings no code in this repository can carry

Both live in the native projects, which are not here.

- **iOS** — Associated Domains: `applinks:wevotrip.com` **and**
  `webcredentials:wevotrip.com`. Without the second, a passkey created in the
  app is never offered on the website.
- **Android** — the `intent-filter` for `wevotrip.com` with
  `android:autoVerify="true"`, and `targetSdkVersion` at whatever Play currently
  requires for new apps (**verify**; it rises every August and an old one is
  refused at upload, not at review).

Take `ANDROID_CERT_FINGERPRINT` from the **Play Console**, not from your own
keystore: with Play App Signing, Google re-signs the app, and App Links verify
against their certificate. Getting it wrong means links open the browser with no
error anywhere.

---

## 7. What to check before you submit, not after

`/admin/health` with an admin session — Store readiness and Billing both green
means `supportEmail`, `legal`, `nativeIds` and `billing` are all configured.
That is four of the six blockers in §1 answered by the deployment itself rather
than by memory.

Then, on a real phone, the four things that fail in no other way
([launch.md §7](launch.md)): sign in and reopen the app, tap a magic link from
email, drag a member between families, and buy with a sandbox account then
restore.

**Expect one rejection.** It is normal, it is not a verdict, and the reply is
part of the process — most are answered in a sentence in Resolution Center.
