/**
 * Turning a deep link into a route, and refusing to turn it into anything else.
 *
 * The value this produces is handed to the router, which pushes it onto
 * history. A universal link can only arrive for a domain the association file
 * claims, so this is the second line of defence rather than the first — but the
 * first is a JSON file on a CDN, and "one mistake in that file away from an
 * open redirect" is not a place to leave a router.
 */
import { describe, expect, it } from "vitest";
import { pathFromDeepLink } from "./nativeBridge";

describe("pathFromDeepLink", () => {
  it("keeps the path, the query and the fragment", () => {
    expect(
      pathFromDeepLink("https://backtotravelling.com/auth/magic/abc123")
    ).toBe("/auth/magic/abc123");
    expect(
      pathFromDeepLink("https://backtotravelling.com/join/XYZ?ref=sms")
    ).toBe("/join/XYZ?ref=sms");
    expect(
      pathFromDeepLink("https://backtotravelling.com/trips/4#budget")
    ).toBe("/trips/4#budget");
  });

  it("accepts the app's own scheme", () => {
    expect(pathFromDeepLink("capacitor://localhost/trips/9")).toBe("/trips/9");
  });

  it("returns the root for a bare domain", () => {
    expect(pathFromDeepLink("https://backtotravelling.com")).toBe("/");
  });

  /**
   * The one that matters. `//evil.example` is a protocol-relative URL: pushing
   * it navigates off-site, and it is exactly what an attacker would put in a
   * link if this returned the path unexamined.
   */
  it("refuses a protocol-relative path", () => {
    expect(pathFromDeepLink("https://backtotravelling.com//evil.example")).toBe(
      null
    );
    expect(
      pathFromDeepLink("https://backtotravelling.com//evil.example/join/1")
    ).toBe(null);
  });

  it("refuses a scheme that is not http, https or the app's own", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///etc/passwd",
      "intent://scan/#Intent;scheme=zxing;end",
    ]) {
      expect(pathFromDeepLink(url), url).toBe(null);
    }
  });

  it("refuses anything that is not a URL at all", () => {
    for (const url of ["", "not a url", "/just/a/path", "://"]) {
      expect(pathFromDeepLink(url), url).toBe(null);
    }
  });
});
