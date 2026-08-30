/**
 * The two files that decide whether a link opens the app or the browser.
 *
 * Everything about these fails silently. Apple and Google fetch them, cache
 * whatever comes back, and show nothing when it is wrong — links simply keep
 * opening the browser, and a passkey made in the app is not offered on the web.
 * So the things worth pinning down are the ones with no feedback loop: that
 * they are reachable at all past the SPA rewrite, that they answer JSON, and
 * that they refuse to serve a document full of placeholder identifiers.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (relative: string) =>
  readFileSync(join(import.meta.dirname, relative), "utf8");

describe("the rewrite that would break them", () => {
  /**
   * `vercel.json` sends everything that is not `/api/` to `/index.html`. A file
   * in `client/public/.well-known/` would therefore be served the HTML shell —
   * with a 200 status, to a fetcher expecting JSON. That is why these are
   * Express routes and why the rewrite list needs this entry ahead of the
   * catch-all.
   */
  it("routes .well-known to the server, before the SPA fallback", () => {
    const vercel = JSON.parse(read("../../vercel.json")) as {
      rewrites: { source: string; destination: string }[];
    };
    const sources = vercel.rewrites.map(r => r.source);
    const wellKnown = sources.findIndex(s => s.includes(".well-known"));
    const catchAll = sources.findIndex(s => s.includes("(?!api/)"));

    expect(wellKnown, ".well-known needs its own rewrite").toBeGreaterThan(-1);
    expect(catchAll).toBeGreaterThan(-1);
    expect(
      wellKnown,
      ".well-known must come before the SPA catch-all, or it never matches"
    ).toBeLessThan(catchAll);
    expect(vercel.rewrites[wellKnown].destination).toBe("/api/server");
  });
});

describe("the handlers", () => {
  const src = read("./wellKnown.ts");

  it("serve Apple's file without an extension, as JSON", () => {
    // Apple requires all three: the exact path, no `.json` suffix, and a JSON
    // content type. Getting any of them wrong breaks universal links with no
    // error anywhere.
    expect(src).toContain('"/.well-known/apple-app-site-association"');
    expect(src).not.toContain("apple-app-site-association.json");
    expect(src).toContain('res.setHeader("Content-Type", "application/json")');
  });

  it("serve Google's file at its exact path", () => {
    expect(src).toContain('"/.well-known/assetlinks.json"');
  });

  it("404 rather than serve placeholder identifiers", () => {
    // Both platforms cache what they fetch. A well-formed file naming an app
    // that does not exist is worse than an absent one, because the absent one
    // can be fixed by adding it.
    expect(src).toContain("res.status(404)");
    expect(src).toContain("config.native.appleTeamId");
    expect(src).toContain("config.native.androidCertFingerprint");
  });

  it("claim the paths a link can actually land on", () => {
    for (const path of ["/auth/magic/*", "/join/*", "/trips/*"]) {
      expect(src, `${path} must be claimed`).toContain(path);
    }
  });

  it("include webcredentials, which is what passkeys need", () => {
    // Separate from `applinks`: a deployment can want deep links without
    // passkeys, and Apple reads the two independently.
    expect(src).toContain("webcredentials");
  });

  it("ask Android for both permissions", () => {
    expect(src).toContain("delegate_permission/common.handle_all_urls");
    expect(src).toContain("delegate_permission/common.get_login_creds");
  });
});
