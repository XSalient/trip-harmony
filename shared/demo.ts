/**
 * The demo's identifiers, in the one place both sides can see them.
 *
 * The seeder uses the prefixes to know which rows are its to delete; the
 * landing page uses the invite code to decide whether there is a demo to offer.
 * Two copies of these strings would mean a "Try the demo" button that outlives
 * the data behind it.
 *
 * See `docs/runbooks/demo.md` and
 * [ADR-0015](../docs/adr/0015-demo-data-lives-in-its-own-namespace.md).
 */

/** Prefix on every seeded user's `openId`. The reset is scoped to it. */
export const DEMO_OPEN_ID_PREFIX = "demo:";

/** Prefix on every seeded trip's `inviteCode`. Unique and indexed, so it is cheap to select on. */
export const DEMO_INVITE_CODE_PREFIX = "DEMO-";

/**
 * Reserved by RFC 2606, so a demo account can never receive mail or be
 * mistaken for a person.
 */
export const DEMO_EMAIL_DOMAIN = "demo.backtotravelling.example";

/**
 * The trip a visitor lands on from the marketing site: the seven-person
 * argument over the Algarve, mid-flight, with every screen already populated.
 *
 * The landing page asks the API whether this trip exists and only offers the
 * demo when it does — so an unseeded deployment shows nothing rather than a
 * button that leads to "Trip not found".
 */
export const DEMO_TOUR_INVITE_CODE = "DEMO-LISBON";

/** Where the invite-link tour goes. Public to read; joining still requires an account. */
export const DEMO_TOUR_PATH = `/join/${DEMO_TOUR_INVITE_CODE}`;

/**
 * The three seats a visitor can take in the demo, without typing anything.
 *
 * A demo that opens with a login form is a demo most people close. These are
 * the personas `auth.demoSignIn` will issue a session for — and the only ones,
 * because it prefixes every lookup with `DEMO_OPEN_ID_PREFIX` and can therefore
 * never reach a real account.
 *
 * They double as the clearest explanation of the permission model there is:
 * the same trip, seen from three different seats.
 */
export const DEMO_PERSONAS = [
  {
    /** Resolves to openId `demo:ava`. */
    key: "ava",
    name: "Ava Bennett",
    role: "Admin",
    blurb: "Runs all three trips. Can finalise, invite and change roles.",
  },
  {
    key: "priya",
    name: "Priya Raghunathan",
    role: "Tripmate",
    blurb: "Votes, comments and proposes — but cannot finalise anything.",
  },
  {
    key: "nina",
    name: "Nina Kowalski",
    role: "Watcher",
    blurb: "Follows the plan. Sees no votes, no proposers and no AI referee.",
  },
] as const;

export type DemoPersonaKey = (typeof DEMO_PERSONAS)[number]["key"];

/**
 * What a persona key is allowed to look like.
 *
 * Narrow on purpose: the key is concatenated onto the demo prefix to form an
 * `openId`, and a key that could contain anything is a key that invites someone
 * to try.
 */
export const DEMO_PERSONA_KEY_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
