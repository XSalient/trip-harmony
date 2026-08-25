/**
 * Pages are fetched when somebody asks for them.
 *
 * All fifteen were imported statically, so the first load carried recharts,
 * streamdown, framer-motion, embla and react-day-picker regardless of which
 * page you had asked for — the sign-in screen included, which uses none of
 * them. Splitting them took the entry chunk from 1.9 MB to 561 kB.
 *
 * Structural, because the thing being asserted is a build outcome and the
 * regression is silent: one `import Page from "./pages/Page"` added by habit
 * pulls that page's whole dependency tree back into the entry chunk, and
 * nothing fails — the app just gets slower to open again.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(import.meta.dirname, "App.tsx"), "utf8");

/** Pages that are deliberately in the entry chunk, and why. */
const eager = {
  Home: "what an unauthenticated visitor lands on — splitting it only adds a round trip before anything is drawn",
  NotFound: "the fallback, which should never itself fail to load",
};

const staticPageImports = [
  ...source.matchAll(/^import (\w+) from "[^"]*\/pages\/(\w+)"/gm),
].map(m => m[1]);

describe("route code splitting", () => {
  it("splits every page but the two that are deliberately eager", () => {
    expect(staticPageImports.sort()).toEqual(Object.keys(eager).sort());
  });

  it("lazily loads the rest", () => {
    const lazyPages = [
      ...source.matchAll(/const (\w+) = lazy\(\(\) => import\(/g),
    ].map(m => m[1]);
    // The trip screens are where the heavy dependencies live.
    for (const page of [
      "TripReferee",
      "TripBudget",
      "TripDates",
      "TripMembers",
      "TripDashboard",
    ])
      expect(lazyPages).toContain(page);
  });

  it("has somewhere to wait while a chunk arrives", () => {
    expect(source).toContain("<Suspense");
    expect(source).toContain("fallback={<PageLoading />}");
  });

  it("keeps the boundary outside the suspense, not inside it", () => {
    // A chunk that fails to load — a stale deploy, a flaky connection — is an
    // error to show, not a white screen.
    expect(source.indexOf("<ErrorBoundary>")).toBeLessThan(
      source.indexOf("<Suspense")
    );
  });
});
