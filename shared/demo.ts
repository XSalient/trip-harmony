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
export const DEMO_EMAIL_DOMAIN = "demo.wevotrip.example";

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

/** Forces the demo tour on where the hostname would not. See `isDemoTourHost`. */
export const DEMO_TOUR_ENV_VAR = "DEMO_TOUR_ENABLED";

/**
 * Whether a request arriving on this host should be offered the demo.
 *
 * The demo and the product are one deployment behind two domains — the sales
 * demo at `demo.wevotrip.com`, the real site at `www`. Two domains
 * pointing at one deployment share a process and therefore share an
 * environment, so nothing in `process.env` can tell a request to one from a
 * request to the other. The `Host` header is the only thing that differs, which
 * is why the demo is gated on it rather than on configuration.
 *
 * `localhost` is included so that seeding a local database and running the app
 * shows the demo with nothing to configure, which is what the runbook promises.
 *
 * This is a shape check and nothing more: it says `demo.anything` is a demo
 * host, and it would say so of a hostname nobody here controls. That is fine,
 * because it is not what keeps the demo off the production site — the boundary
 * is which hostnames Vercel will answer for at all. This function decides what
 * to show on a request that has already arrived; it is not an access control.
 */
export function isDemoTourHost(host: string | undefined): boolean {
  // `Host` carries the port (`localhost:5000`), and hostnames are case-insensitive.
  const hostname = host?.trim().toLowerCase().split(":")[0];
  if (!hostname) return false;
  return hostname === "localhost" || hostname.startsWith("demo.");
}

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

/**
 * The published sign-in password for the seeded accounts.
 *
 * Not a secret, and deliberately not treated as one: it unlocks fictional
 * people in a database meant to be handed to whoever is recording the
 * screencast. Every path that can reach a shared database refuses it — the CLI
 * in `scripts/demo/options.ts`, and `admin.resetDemo` — so publishing it here
 * cannot open a real account.
 */
export const DEFAULT_DEMO_PASSWORD = "demo-tripmate-2026";

/**
 * The environment variable a demo password may arrive in.
 *
 * Read by the CLI instead of `--password=`, and by `admin.resetDemo`, which has
 * no command line to read. Lives here because both a script and the server need
 * it, and neither should be importing from the other.
 */
export const DEMO_PASSWORD_ENV_VAR = "DEMO_SEED_PASSWORD";

/**
 * Whether a password was chosen on purpose rather than fallen back to.
 *
 * The one rule both callers share: a password that is missing, too short, or
 * the one printed in the runbook does not count as chosen, and must not be
 * enough to rebuild a demo on a shared database.
 */
export function isUsableDemoPassword(
  value: string | undefined
): value is string {
  const trimmed = value?.trim();
  return (
    trimmed !== undefined &&
    trimmed.length >= 8 &&
    trimmed !== DEFAULT_DEMO_PASSWORD
  );
}
