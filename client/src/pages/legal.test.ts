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
  // Google Play's Data safety form takes a deletion URL, and the person it
  // exists for has uninstalled the app — so this one is even less able to
  // survive a session check than the other two.
  "DeleteAccount.tsx": read("DeleteAccount.tsx"),
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
    expect(app).toContain('path="/delete-account"');
  });

  it("offers deletion without an account, not only inside the app", () => {
    // Play's requirement, and the half Apple's does not cover: somebody who
    // uninstalled the app, or lost their password, still has to be able to ask.
    // The email route is what makes that true, so it is the part worth
    // asserting.
    const page = PUBLIC_PAGES["DeleteAccount.tsx"];
    expect(page).toContain("legal.email");
    expect(page).toContain("mailto:");
  });

  it("is linked from the only screen a signed-out visitor sees", () => {
    // That screen is `Landing.tsx`. It used to be a `LandingPage` function
    // inside `Home.tsx`; Home now renders `<Landing />` when there is no
    // session and the dashboard when there is. The requirement is unchanged —
    // only the file that has to satisfy it moved.
    const landing = read("Landing.tsx");
    expect(landing).toContain('href="/privacy"');
    expect(landing).toContain('href="/terms"');
  });
});

describe("the operator's details", () => {
  /**
   * They are configuration (`LEGAL_ENTITY`, `LEGAL_JURISDICTION`,
   * `LEGAL_ADDRESS`), served by `system.support`. Placeholders exist only as
   * the fallback inside `useLegal`, so an unset deployment shows a visible
   * bracket instead of an empty gap — and so filling them in is a Doppler edit
   * rather than a rebuild and a release.
   *
   * A page that hardcoded one would ship it forever, because nothing about
   * setting the variable would change the page. That is what this guards.
   */
  it("are never hardcoded into a page", () => {
    for (const [name, src] of Object.entries(PUBLIC_PAGES)) {
      if (name.endsWith("LegalPage.tsx")) continue;
      expect(
        /\[[A-Z][A-Z ,.]+\]/.test(src),
        `${name} hardcodes a placeholder — read it from useLegal() instead`
      ).toBe(false);
    }
  });

  it("reach every public page through the hook", () => {
    for (const page of ["Privacy.tsx", "Terms.tsx", "DeleteAccount.tsx"]) {
      const src = PUBLIC_PAGES[page as keyof typeof PUBLIC_PAGES];
      expect(src, `${page} should call useLegal()`).toContain("useLegal()");
    }
  });

  it("are reported by the health endpoint", () => {
    // A submission needs all three set, and the only way to check a deployed
    // environment without shell access is /api/health.
    const env = readFileSync(
      join(import.meta.dirname, "../../../server/_core/env.ts"),
      "utf8"
    );
    expect(env).toContain("legal: config.legal.isComplete");
  });
});

/**
 * Reachable is not the same as tappable.
 *
 * Both links did render, at the bottom of the only screen a signed-out visitor
 * sees — underneath the floating "Start a trip" bar, which took every tap
 * aimed at them. The cause was two utilities setting one property: the footer
 * asked for `pb-28`, `safe-area-bottom` is also a `padding-bottom` rule, and
 * whichever the stylesheet emitted last won. It resolved to 8px.
 *
 * So the clearance is a margin now, and this is the assertion that keeps it
 * one: a padding utility on that element is in a fight it can silently lose.
 */
describe("the policy links on the landing page", () => {
  const landing = read("Landing.tsx");
  const footer =
    landing.slice(landing.indexOf("<footer"), landing.indexOf("</footer>")) ||
    "";

  it("exist, because this is the only screen a signed-out visitor sees", () => {
    expect(footer).toContain('href="/privacy"');
    expect(footer).toContain('href="/terms"');
  });

  it("clear the floating call to action with a margin, not padding", () => {
    const [classes = ""] = footer.match(/className="[^"]*"/) ?? [];
    expect(classes).toMatch(/\bmb-\d/);
    // The one that lost to `safe-area-bottom`, which is itself padding-bottom.
    expect(classes).not.toMatch(/\bpb-\d/);
  });
});
