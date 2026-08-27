#!/usr/bin/env tsx
/**
 * Photographs every screen of the app at phone size, for design work.
 *
 *   pnpm dev                  in one terminal
 *   pnpm screenshots          in another
 *
 * Output lands in `docs/screenshots/mobile/`, numbered in the order a person
 * would meet the screens: the signed-out entry, then a seeded trip from the
 * inside. `docs/screenshots/README.md` is the index.
 *
 * Two things this deliberately does not do. It does not start the server —
 * a capture run against a server you are already watching is easier to debug
 * than one that owns its own child process. And it does not seed: it expects
 * `pnpm seed:demo` to have run, because every populated screen here is the
 * demo story (`server/demo/story.ts`), and a screenshot of an empty state
 * teaches a redesign nothing.
 *
 * Sign-in goes through `auth.demoSignIn` by clicking the seat picker on the
 * landing page, which is also how a visitor does it — no credentials, and one
 * fewer thing to keep in step with the auth code.
 *
 * TypeScript rather than the `.mjs` most of `scripts/` uses, for the same
 * reason as `seed-demo.ts`: nothing in a deploy runs it, so it never has to
 * work before the toolchain is installed.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, rm } from "node:fs/promises";
import { extname, join } from "node:path";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "playwright";

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:5000";
const OUT_DIR = "docs/screenshots/mobile";

/**
 * Where the demo's remote photos are kept between runs. Chromium cannot always
 * reach the open internet — a sandboxed CI box, a locked-down laptop — and an
 * accommodation card with an empty grey rectangle where the house should be is
 * a misleading thing to hand a designer. So every off-site image is fetched
 * once with `curl`, which does have a route, and replayed from disk after that.
 * Set SCREENSHOT_IMAGE_CACHE=off to let the browser fetch them itself.
 */
const IMAGE_CACHE_DIR = ".cache/screenshot-images";
const USE_IMAGE_CACHE = process.env.SCREENSHOT_IMAGE_CACHE !== "off";

/**
 * The phone the design targets: an iPhone 15-class viewport at 2× so the PNGs
 * stay legible when someone zooms into a control.
 */
const VIEWPORT = { width: 390, height: 844 };
const SCALE = 2;

/**
 * This sandbox ships Chromium at a fixed path and blocks the download
 * Playwright would otherwise run for a version it does not recognise. Point at
 * whatever browser is present and let Playwright find its own everywhere else.
 */
const EXECUTABLE_PATH =
  process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";

/** The trip every "inside the app" screen is taken from — the fullest one. */
const HERO_TRIP_NAME = "Lisbon & the Algarve";

/**
 * Motion is the enemy of a reproducible screenshot: framer-motion, embla and
 * the dialog transitions all render intermediate frames that differ run to run.
 * Freezing them costs nothing — every one of them ends at the state we want.
 */
const FREEZE_MOTION = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    scroll-behavior: auto !important;
  }
`;

type Shot = {
  /** File name after the running number, e.g. `trip-dashboard`. */
  name: string;
  /** What the index should say this screen is. */
  caption: string;
  /** Path to open, `:id` replaced with the hero trip's id. Omit to stay put. */
  path?: string;
  /** Clicks or waits that put the screen into the state worth photographing. */
  prepare?: (page: Page) => Promise<void>;
  /**
   * Dialogs are the size of the viewport and sit over a scrolled-away page, so
   * they are captured as the phone sees them; pages are captured whole.
   */
  fullPage?: boolean;
};

/** Screens a signed-out visitor can reach. */
const SIGNED_OUT: Shot[] = [
  {
    name: "landing",
    caption: "Marketing landing page, signed out",
    path: "/",
    fullPage: true,
  },
  {
    name: "auth-sign-in",
    caption: "Sign-in dialog — passwordless first",
    path: "/",
    prepare: page => click(page, "Get Started"),
  },
  {
    name: "auth-sign-in-password",
    caption: "Sign-in dialog with the password field revealed",
    path: "/",
    prepare: async page => {
      await click(page, "Get Started");
      await click(page, "Sign in with password");
    },
  },
  {
    name: "auth-register",
    caption: "Create-account dialog",
    path: "/",
    prepare: async page => {
      await click(page, "Get Started");
      await click(page, "Sign up");
    },
  },
  {
    name: "auth-magic-link-sent",
    caption: "Magic link sent — 'Check your inbox' state",
    path: "/",
    prepare: async page => {
      await click(page, "Get Started");
      await page
        .getByLabel(/email/i)
        .first()
        .fill("ava@demo.backtotravelling.example");
      await click(page, /email me a sign-in link|send.*link|continue/i);
      await page.getByText(/check your inbox/i).waitFor({ timeout: 15_000 });
    },
  },
  {
    name: "demo-seat-picker",
    caption: "'Look around as…' — the three demo seats",
    path: "/",
    prepare: page => click(page, "See a real trip"),
  },
  {
    name: "join-trip",
    caption: "Invite-code landing, signed out (/join/DEMO-CHAMONIX)",
    path: "/join/DEMO-CHAMONIX",
    fullPage: true,
  },
  {
    name: "join-trip-emailed-invite",
    caption: "The same screen reached from an emailed invite token",
    path: "/join/DEMO-CHAMONIX?invite=demo-chamonix-nina-invite",
    fullPage: true,
  },
  {
    name: "magic-link-invalid",
    caption: "Magic-link verification with a token that does not resolve",
    path: "/auth/magic/invalid-token",
    fullPage: true,
  },
  {
    name: "not-found",
    caption: "404",
    path: "/404",
    fullPage: true,
  },
];

/** Screens behind sign-in, as Ava — the trip's organiser. */
const SIGNED_IN: Shot[] = [
  {
    name: "home-trip-list",
    caption: "Signed-in home: every trip you are on",
    path: "/",
    fullPage: true,
  },
  {
    name: "create-trip",
    caption: "New trip form",
    path: "/trips/new",
    fullPage: true,
  },

  // --- The hub, and the menus hanging off it ------------------------------
  {
    name: "trip-dashboard",
    caption: "Trip hub — Lisbon, mid-planning",
    path: "/trips/:id",
    fullPage: true,
  },
  {
    name: "trip-actions-menu",
    caption: "Trip actions menu",
    path: "/trips/:id",
    prepare: page => click(page, /trip actions/i),
  },
  {
    name: "trip-edit",
    caption: "Edit trip dialog",
    path: "/trips/:id",
    prepare: async page => {
      await click(page, /trip actions/i);
      await click(page, /edit trip/i);
    },
  },
  {
    name: "trip-duplicate",
    caption: "Duplicate trip dialog",
    path: "/trips/:id",
    prepare: async page => {
      await click(page, /trip actions/i);
      await click(page, /duplicate trip/i);
    },
  },
  {
    name: "trip-delete",
    caption: "Delete trip confirmation",
    path: "/trips/:id",
    prepare: async page => {
      await click(page, /trip actions/i);
      await click(page, /delete trip/i);
    },
  },

  // --- Dates ---------------------------------------------------------------
  {
    name: "dates",
    caption: "Date proposals with votes",
    path: "/trips/:id/dates",
    fullPage: true,
  },
  {
    name: "dates-propose",
    caption: "Propose dates dialog",
    path: "/trips/:id/dates?add=1",
  },
  {
    name: "dates-who-voted",
    caption: "'Who voted' breakdown on a date proposal",
    path: "/trips/:id/dates",
    prepare: page => click(page, /\d+\/\d+ voted/),
  },
  {
    name: "dates-comments",
    caption: "Comment thread on a proposal",
    path: "/trips/:id/dates",
    prepare: page => click(page, /comments/i),
  },

  // --- Suggestions ---------------------------------------------------------
  {
    name: "suggestions",
    caption: "Places suggested for the trip",
    path: "/trips/:id/suggestions",
    fullPage: true,
  },
  {
    name: "suggestions-add",
    caption: "Add a suggestion dialog",
    path: "/trips/:id/suggestions?add=1",
  },

  // --- Accommodations ------------------------------------------------------
  {
    name: "accommodations",
    caption: "Accommodation options, AI match scores, one finalised",
    path: "/trips/:id/accommodations",
    fullPage: true,
  },
  {
    name: "accommodations-add",
    caption: "Add accommodation dialog — paste a listing URL",
    path: "/trips/:id/accommodations?add=1",
  },
  {
    name: "accommodations-vote-score",
    caption: "How a vote score was reached",
    path: "/trips/:id/accommodations",
    prepare: page => click(page, /^Vote score/),
  },
  {
    name: "accommodations-ai-match",
    caption: "AI match analysis, expanded on a card",
    path: "/trips/:id/accommodations",
    prepare: async page => {
      await click(page, /AI Match/i);
      await page.waitForTimeout(600);
    },
    fullPage: true,
  },

  // --- Budget --------------------------------------------------------------
  {
    name: "budget",
    caption: "Budget proposals and per-person tracking",
    path: "/trips/:id/budget",
    fullPage: true,
  },
  {
    name: "budget-propose",
    caption: "Propose a budget dialog",
    path: "/trips/:id/budget?add=1",
  },

  // --- The rest of the trip ------------------------------------------------
  {
    name: "referee",
    caption: "AI referee — conflict analysis",
    path: "/trips/:id/referee",
    fullPage: true,
  },
  {
    name: "preferences",
    caption: "Your must-haves and dealbreakers for this trip",
    path: "/trips/:id/preferences",
    fullPage: true,
  },
  {
    name: "members",
    caption: "Who is coming, grouped by household",
    path: "/trips/:id/members",
    fullPage: true,
  },
  {
    name: "members-contacts",
    caption: "Invite from saved contacts",
    path: "/trips/:id/members",
    prepare: page => click(page, /invite from my contacts/i),
  },
  {
    name: "members-add-without-account",
    caption: "Add someone who has no account",
    path: "/trips/:id/members",
    prepare: page => click(page, /add without an account/i),
  },

  // --- Other trips, for the states Lisbon does not show --------------------
  {
    name: "trip-dashboard-early",
    caption: "A trip still picking dates — Chamonix, nothing decided yet",
    path: "/trips/:chamonix",
    fullPage: true,
  },
  {
    name: "accommodations-empty",
    caption: "Accommodations before anyone has proposed one",
    path: "/trips/:chamonix/accommodations",
    fullPage: true,
  },
  {
    name: "trip-dashboard-settled",
    caption: "A trip with every decision made — Kyoto",
    path: "/trips/:kyoto",
    fullPage: true,
  },

  // --- Account-level screens ----------------------------------------------
  {
    name: "notifications",
    caption: "Notification feed",
    path: "/notifications",
    fullPage: true,
  },
  {
    name: "profile",
    caption: "Profile, password and passkeys",
    path: "/profile",
    fullPage: true,
  },
  {
    name: "profile-set-password",
    caption: "Change password dialog",
    path: "/profile",
    prepare: page => click(page, /change password/i),
  },
  {
    name: "admin",
    caption: "Admin — demo data reset (app admins only)",
    path: "/admin",
    fullPage: true,
  },
  {
    name: "admin-reset-confirm",
    caption: "'Reset the demo?' confirmation",
    path: "/admin",
    prepare: page => click(page, /reset demo data/i),
  },
];

/**
 * Fetches one off-site image through `curl` and remembers it. `curl` reads the
 * environment's proxy settings, so it works in places the browser's own socket
 * does not; a failure is not fatal, the request simply goes on to the network
 * and may come back empty.
 */
function cachedImage(
  url: string
): { body: Buffer; contentType: string } | null {
  const key = createHash("sha1").update(url).digest("hex");
  const suffix = (extname(new URL(url).pathname) || ".img").slice(0, 5);
  const file = join(IMAGE_CACHE_DIR, key + suffix);
  if (!existsSync(file)) {
    try {
      execFileSync("curl", ["-sSLf", "--max-time", "30", "-o", file, url], {
        stdio: "ignore",
      });
    } catch {
      return null;
    }
  }
  const types: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".svg": "image/svg+xml",
  };
  return {
    body: readFileSync(file),
    contentType: types[suffix.toLowerCase()] ?? "image/jpeg",
  };
}

/** Serves every off-site image from the cache above. */
async function serveImagesFromCache(context: BrowserContext) {
  await mkdir(IMAGE_CACHE_DIR, { recursive: true });
  await context.route("**/*", async route => {
    const request = route.request();
    const url = request.url();
    if (request.resourceType() !== "image" || url.startsWith(BASE_URL)) {
      return route.continue();
    }
    const hit = cachedImage(url);
    if (!hit) return route.continue();
    return route.fulfill({ contentType: hit.contentType, body: hit.body });
  });
}

/** Clicks the first visible thing with this name, and lets the UI settle. */
async function click(page: Page, name: string | RegExp) {
  const target = page.getByRole("button", { name }).first();
  const fallback: Locator = page.getByText(name).first();
  const locator = (await target.count()) > 0 ? target : fallback;
  await locator.click({ timeout: 15_000 });
  await page.waitForTimeout(500);
}

/** Waits for the page to stop fetching, then for React to have painted it. */
async function settle(page: Page) {
  await page
    .waitForLoadState("networkidle", { timeout: 30_000 })
    .catch(() => undefined);
  await page.waitForTimeout(700);
}

async function capture(
  page: Page,
  index: number,
  shot: Shot,
  tripIds: TripIds
) {
  if (shot.path) {
    const path = shot.path
      .replace(":chamonix", String(tripIds.chamonix))
      .replace(":kyoto", String(tripIds.kyoto))
      .replace(":id", String(tripIds.hero));
    await page.goto(BASE_URL + path, { waitUntil: "domcontentloaded" });
    await settle(page);
  }
  if (shot.prepare) {
    await shot.prepare(page);
    await page.waitForTimeout(400);
  }
  const file = join(
    OUT_DIR,
    `${String(index).padStart(2, "0")}-${shot.name}.png`
  );
  await page.screenshot({ path: file, fullPage: shot.fullPage ?? false });
  return file;
}

type TripIds = { hero: number; chamonix: number; kyoto: number };

/** Takes the demo's admin seat, the way the landing page offers it. */
async function signInAsAva(page: Page) {
  await page.goto(BASE_URL + "/", { waitUntil: "domcontentloaded" });
  await settle(page);
  await click(page, "See a real trip");
  await click(page, /Ava/);
  await page.waitForTimeout(2500);
  await settle(page);
}

/**
 * Reads the trip ids off the signed-in home screen. Hard-coding them would
 * break the first time somebody reseeds into a database that already had rows.
 */
async function findTripIds(page: Page): Promise<TripIds> {
  const links = await page.$$eval('a[href^="/trips/"]', anchors =>
    anchors
      .map(a => ({
        href: a.getAttribute("href") ?? "",
        text: (a as HTMLElement).innerText,
      }))
      .filter(l => /^\/trips\/\d+$/.test(l.href))
  );
  const idFor = (name: string) => {
    const match = links.find(l => l.text.includes(name));
    return match ? Number(match.href.split("/")[2]) : 0;
  };
  const hero = idFor(HERO_TRIP_NAME);
  if (!hero) {
    throw new Error(
      `No "${HERO_TRIP_NAME}" trip on the home screen. Run \`pnpm seed:demo\` first.`
    );
  }
  return {
    hero,
    chamonix: idFor("Chamonix") || hero,
    kyoto: idFor("Kyoto") || hero,
  };
}

async function newContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    isMobile: true,
    hasTouch: true,
    colorScheme: "light",
    locale: "en-GB",
    timezoneId: "Europe/London",
  });
  await context.addInitScript(css => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = css;
      document.head.appendChild(style);
    });
  }, FREEZE_MOTION);
  if (USE_IMAGE_CACHE) await serveImagesFromCache(context);
  return context;
}

function say(message = "") {
  process.stdout.write(`${message}\n`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const file of await readdir(OUT_DIR)) {
    if (file.endsWith(".png")) await rm(join(OUT_DIR, file));
  }

  const browser = await chromium.launch({ executablePath: EXECUTABLE_PATH });
  const failures: string[] = [];
  let index = 0;

  // Signed out first, in its own context: once a session cookie exists, `/`
  // is the trip list and the landing page is unreachable.
  const anonymous = await newContext(browser);
  const anonymousPage = await anonymous.newPage();
  const noTrips: TripIds = { hero: 0, chamonix: 0, kyoto: 0 };
  for (const shot of SIGNED_OUT) {
    index += 1;
    try {
      say(`  ${await capture(anonymousPage, index, shot, noTrips)}`);
    } catch (error) {
      failures.push(`${shot.name}: ${(error as Error).message.split("\n")[0]}`);
      say(`  ✗ ${shot.name}`);
    }
  }
  await anonymous.close();

  const signedIn = await newContext(browser);
  const page = await signedIn.newPage();
  await signInAsAva(page);
  const tripIds = await findTripIds(page);
  say(`\nSigned in as Ava. Hero trip: ${tripIds.hero}\n`);

  for (const shot of SIGNED_IN) {
    index += 1;
    try {
      say(`  ${await capture(page, index, shot, tripIds)}`);
    } catch (error) {
      failures.push(`${shot.name}: ${(error as Error).message.split("\n")[0]}`);
      say(`  ✗ ${shot.name}`);
    }
  }

  await browser.close();

  say(
    `\n${index - failures.length}/${index} screens captured into ${OUT_DIR}.`
  );
  if (failures.length > 0) {
    say("\nDid not capture:");
    for (const failure of failures) say(`  ${failure}`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${(error as Error).stack ?? error}\n`);
  process.exit(1);
});
