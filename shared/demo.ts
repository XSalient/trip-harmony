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

/** Where that button goes. Public to read; joining still requires an account. */
export const DEMO_TOUR_PATH = `/join/${DEMO_TOUR_INVITE_CODE}`;
