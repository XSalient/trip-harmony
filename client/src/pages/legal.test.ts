/**
 * The privacy policy and terms must render to somebody with no account.
 *
 * That is the whole requirement: Apple wants a privacy policy at a URL a
 * reviewer can open, and the reviewer is signed out. It is also the property
 * most likely to break silently — every other page here calls `useAuth` or
 * wraps itself in `AppShell`, so adding either by habit would redirect a
 * reviewer to the landing page and fail a submission for a reason nobody could
 * see from the code.
 *
 * Structural, like `App.routing.test.ts` next door: there is no React test
 * setup in this project, and this asserts a fact about the source rather than a
 * rendering.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (relative: string) =>
  readFileSync(join(import.meta.dirname, relative), "utf8");

const PUBLIC_PAGES = {
  "Privacy.tsx": read("Privacy.tsx"),
  "Terms.tsx": read("Terms.tsx"),
  "../components/LegalPage.tsx": read("../components/LegalPage.tsx"),
};

describe("the legal pages are reachable signed out", () => {
  it("never gates on a session", () => {
    for (const [name, src] of Object.entries(PUBLIC_PAGES)) {
      // Imports and calls, not the words — these files explain in prose that
      // they avoid both, and a substring match would read that as a violation.
      expect(
        /^import .*useAuth/m.test(src) || /\buseAuth\(/.test(src),
        `${name} must not call useAuth — a signed-out reviewer has to see this page`
      ).toBe(false);
      expect(
        /^import .*AppShell/m.test(src) || /<AppShell\b/.test(src),
        `${name} must not use AppShell, whose header assumes a signed-in user`
      ).toBe(false);
    }
  });

  it("reads the contact address from a public procedure", () => {
    // `system.support` is `publicProcedure`. A protected one would throw for
    // the very visitor these pages exist for.
    expect(PUBLIC_PAGES["../components/LegalPage.tsx"]).toContain(
      "system.support"
    );
  });

  it("is routed", () => {
    const app = read("../App.tsx");
    expect(app).toContain('path="/privacy"');
    expect(app).toContain('path="/terms"');
  });

  it("is linked from the only screen a signed-out visitor sees", () => {
    const home = read("Home.tsx");
    expect(home).toContain('href="/privacy"');
    expect(home).toContain('href="/terms"');
  });
});

describe("the operator's details", () => {
  /**
   * Placeholders are allowed to exist — they have to, until somebody fills them
   * in — but they must all live in `LEGAL` in one file. Scattered through two
   * pages, one of them ships to production still saying [JURISDICTION].
   *
   * `docs/runbooks/launch.md` lists filling these in as a submission blocker.
   */
  it("keeps every placeholder in one place", () => {
    for (const [name, src] of Object.entries(PUBLIC_PAGES)) {
      if (name.endsWith("LegalPage.tsx")) continue;
      expect(
        /\[[A-Z][A-Z ,.]+\]/.test(src),
        `${name} carries its own placeholder — put it in LEGAL instead`
      ).toBe(false);
    }
  });

  it("still names the operator and the jurisdiction on both pages", () => {
    for (const page of ["Privacy.tsx", "Terms.tsx"]) {
      expect(PUBLIC_PAGES[page as keyof typeof PUBLIC_PAGES]).toContain(
        "LEGAL."
      );
    }
  });
});
