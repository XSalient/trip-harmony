/**
 * `isDemoTourHost` decides whether a request gets offered the demo, and the
 * product site and the demo are the same deployment behind two domains — so
 * this one comparison is what keeps "See a real trip" off the marketing page.
 */
import { describe, expect, it } from "vitest";

import { isDemoTourHost } from "./demo.js";

describe("isDemoTourHost", () => {
  it("offers the demo on the demo subdomain", () => {
    expect(isDemoTourHost("demo.wevotrip.com")).toBe(true);
  });

  it("does not offer it on the product site", () => {
    // The reason this function exists.
    expect(isDemoTourHost("www.wevotrip.com")).toBe(false);
    expect(isDemoTourHost("wevotrip.com")).toBe(false);
  });

  it("offers it on localhost, so a seeded local database needs no configuration", () => {
    expect(isDemoTourHost("localhost")).toBe(true);
    // `Host` carries the port, which is how it actually arrives in development.
    expect(isDemoTourHost("localhost:5000")).toBe(true);
  });

  it("does not offer it on a preview deployment", () => {
    // Previews use DEMO_TOUR_ENABLED instead: their URL is generated per build,
    // so no hostname rule could recognise them.
    expect(
      isDemoTourHost("trip-harmony-git-claude-abc123-someteam.vercel.app")
    ).toBe(false);
  });

  it("treats the hostname case-insensitively, as DNS does", () => {
    expect(isDemoTourHost("DEMO.WeVoTrip.com")).toBe(true);
    expect(isDemoTourHost("WWW.WeVoTrip.com")).toBe(false);
  });

  it("refuses a missing or empty host rather than defaulting to on", () => {
    expect(isDemoTourHost(undefined)).toBe(false);
    expect(isDemoTourHost("")).toBe(false);
    expect(isDemoTourHost("   ")).toBe(false);
  });

  it("is a shape check, not an access control", () => {
    // It says yes to any `demo.` host, including one nobody here controls. That
    // is not the leak it looks like: a request only reaches this code if Vercel
    // already answered for that hostname, and Vercel answers only for the
    // domains attached to the project. This function chooses what to render on
    // a request that has arrived — it is not what decides whether it arrives.
    expect(isDemoTourHost("demo.someone-elses-domain.example")).toBe(true);
    // And a host merely *containing* "demo" is not a demo host, which is the
    // part that would matter if this were ever the only check.
    expect(isDemoTourHost("democracy.example.com")).toBe(false);
    expect(isDemoTourHost("mydemo.wevotrip.com")).toBe(false);
    expect(isDemoTourHost("wevotrip.com.demo.evil.example")).toBe(false);
  });
});
