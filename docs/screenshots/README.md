# Screenshots

Every screen of the app at phone size, captured from the seeded demo. They exist
so a redesign can start from what is actually there rather than from memory.

Regenerate them with `pnpm screenshots` — see `scripts/screenshots.ts`.

## How these were taken

- **Viewport** 390 × 844 (iPhone 15-class) at 2×, light theme, en-GB, Europe/London.
- **Data** the demo story (`pnpm seed:demo`, `server/demo/story.ts`). Every person,
  price and comment below is invented.
- **Seat** Ava Bennett, the trip's organiser, for everything behind sign-in. She
  sees the most: admin-only controls, other people's votes, the referee. Priya
  (tripmate) and Nina (watcher) see materially less — `docs/runbooks/demo.md`
  explains what each seat loses.
- **Trip** _Lisbon & the Algarve_ unless the caption says otherwise. It is the
  fullest one; Chamonix and Kyoto appear where an early-stage or a finished trip
  shows something Lisbon cannot.
- Pages are captured whole, so a screenshot is often taller than the phone. The
  bottom navigation is fixed, so it appears once part-way down a long capture —
  that is the capture, not the app.

## Two things to know before designing from these

- **`/admin` needs an app admin.** No seeded account has `role = 'admin'`, so the
  page renders as 404 for everyone out of the box. Shots 41–42 were taken after
  `update users set role = 'admin' where id = 1` against the local database.
- **`AI Referee` and the listing scraper call live services.** They answered here;
  without `AI_INTEGRATIONS_GEMINI_API_KEY` those screens show their error state
  instead.

## The screens

| #   | File                                        | Screen                                       | Route                             |
| --- | ------------------------------------------- | -------------------------------------------- | --------------------------------- |
| 01  | `mobile/01-landing.png`                     | Marketing landing page, signed out           | `/`                               |
| 02  | `mobile/02-auth-sign-in.png`                | Sign-in dialog — passwordless first          | `/`                               |
| 03  | `mobile/03-auth-sign-in-password.png`       | Sign-in with the password field revealed     | `/`                               |
| 04  | `mobile/04-auth-register.png`               | Create-account dialog                        | `/`                               |
| 05  | `mobile/05-auth-magic-link-sent.png`        | "Check your inbox" after a magic link        | `/`                               |
| 06  | `mobile/06-demo-seat-picker.png`            | "Look around as…" — the three demo seats     | `/`                               |
| 07  | `mobile/07-join-trip.png`                   | Invite-code landing, signed out              | `/join/DEMO-CHAMONIX`             |
| 08  | `mobile/08-join-trip-emailed-invite.png`    | The same screen from an emailed invite token | `/join/:code?invite=…`            |
| 09  | `mobile/09-magic-link-invalid.png`          | Magic link that does not resolve             | `/auth/magic/:token`              |
| 10  | `mobile/10-not-found.png`                   | 404                                          | `/404`                            |
| 11  | `mobile/11-home-trip-list.png`              | Signed-in home: every trip you are on        | `/`                               |
| 12  | `mobile/12-create-trip.png`                 | New trip form                                | `/trips/new`                      |
| 13  | `mobile/13-trip-dashboard.png`              | Trip hub — Lisbon, mid-planning              | `/trips/:id`                      |
| 14  | `mobile/14-trip-actions-menu.png`           | Trip actions menu                            | `/trips/:id`                      |
| 15  | `mobile/15-trip-edit.png`                   | Edit trip dialog                             | `/trips/:id`                      |
| 16  | `mobile/16-trip-duplicate.png`              | Duplicate trip dialog                        | `/trips/:id`                      |
| 17  | `mobile/17-trip-delete.png`                 | Delete trip confirmation                     | `/trips/:id`                      |
| 18  | `mobile/18-dates.png`                       | Date proposals with votes, one locked        | `/trips/:id/dates`                |
| 19  | `mobile/19-dates-propose.png`               | Propose dates dialog                         | `/trips/:id/dates?add=1`          |
| 20  | `mobile/20-dates-who-voted.png`             | "Who voted" breakdown                        | `/trips/:id/dates`                |
| 21  | `mobile/21-dates-comments.png`              | Comment thread on a proposal                 | `/trips/:id/dates`                |
| 22  | `mobile/22-suggestions.png`                 | Places suggested for the trip                | `/trips/:id/suggestions`          |
| 23  | `mobile/23-suggestions-add.png`             | Add a suggestion dialog                      | `/trips/:id/suggestions?add=1`    |
| 24  | `mobile/24-accommodations.png`              | Five options, AI match scores, one finalised | `/trips/:id/accommodations`       |
| 25  | `mobile/25-accommodations-add.png`          | Add accommodation — paste a listing URL      | `/trips/:id/accommodations?add=1` |
| 26  | `mobile/26-accommodations-vote-score.png`   | How a vote score was worked out              | `/trips/:id/accommodations`       |
| 27  | `mobile/27-accommodations-ai-match.png`     | AI match analysis expanded on a card         | `/trips/:id/accommodations`       |
| 28  | `mobile/28-budget.png`                      | Budget proposals and per-person tracking     | `/trips/:id/budget`               |
| 29  | `mobile/29-budget-propose.png`              | Propose a budget dialog                      | `/trips/:id/budget?add=1`         |
| 30  | `mobile/30-referee.png`                     | AI referee — conflict analysis               | `/trips/:id/referee`              |
| 31  | `mobile/31-preferences.png`                 | Your must-haves and dealbreakers             | `/trips/:id/preferences`          |
| 32  | `mobile/32-members.png`                     | Who is coming, grouped by household          | `/trips/:id/members`              |
| 33  | `mobile/33-members-contacts.png`            | Invite from saved contacts                   | `/trips/:id/members`              |
| 34  | `mobile/34-members-add-without-account.png` | Add someone who has no account               | `/trips/:id/members`              |
| 35  | `mobile/35-trip-dashboard-early.png`        | A trip still picking dates — Chamonix        | `/trips/:id`                      |
| 36  | `mobile/36-accommodations-empty.png`        | Accommodations before anyone proposes one    | `/trips/:id/accommodations`       |
| 37  | `mobile/37-trip-dashboard-settled.png`      | A trip with every decision made — Kyoto      | `/trips/:id`                      |
| 38  | `mobile/38-notifications.png`               | Notification feed                            | `/notifications`                  |
| 39  | `mobile/39-profile.png`                     | Profile, password and passkeys               | `/profile`                        |
| 40  | `mobile/40-profile-set-password.png`        | Change password dialog                       | `/profile`                        |
| 41  | `mobile/41-admin.png`                       | Admin — demo data reset                      | `/admin`                          |
| 42  | `mobile/42-admin-reset-confirm.png`         | "Reset the demo?" confirmation               | `/admin`                          |

## Not captured

- **`ComponentShowcase.tsx`** — not routed, and AGENTS.md says it is a demo
  gallery rather than app code.
- **Watcher and tripmate variants** of the trip screens. The same twelve routes
  render differently for Priya and Nina; capturing them means running the script
  again with a different seat.
