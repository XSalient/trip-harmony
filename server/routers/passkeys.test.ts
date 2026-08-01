import { describe, expect, it } from "vitest";
import {
  describeDevice,
  resolveRelyingParty,
  toPublicPasskey,
} from "./passkeys.js";

describe("resolveRelyingParty", () => {
  it("prefers the configured base URL over the request's Host header", () => {
    // The security property that matters: a proxying phishing host must not be
    // able to nominate itself as the relying party.
    const rp = resolveRelyingParty(
      "https://harmony.example",
      "https://evil.test"
    );
    expect(rp).toEqual({
      origin: "https://harmony.example",
      rpID: "harmony.example",
    });
  });

  it("falls back to the request origin when nothing is configured", () => {
    expect(resolveRelyingParty("", "http://localhost:5000")).toEqual({
      origin: "http://localhost:5000",
      rpID: "localhost",
    });
  });

  it("normalises a base URL with a path or trailing slash to a bare origin", () => {
    // WebAuthn compares origins byte-for-byte, so a stray slash breaks sign-in.
    expect(resolveRelyingParty("https://harmony.example/app/", "").origin).toBe(
      "https://harmony.example"
    );
  });

  it("keeps a non-default port, which is part of the origin", () => {
    const rp = resolveRelyingParty("", "http://localhost:3000");
    expect(rp.origin).toBe("http://localhost:3000");
    // …but never part of the RP ID, which is a bare domain.
    expect(rp.rpID).toBe("localhost");
  });
});

describe("describeDevice", () => {
  it("names common platforms", () => {
    expect(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")).toBe(
      "iPhone"
    );
    expect(
      describeDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)")
    ).toBe("Mac");
    expect(describeDevice("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe(
      "Android device"
    );
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(
      "Windows device"
    );
  });

  it("falls back to a generic label for an unknown or missing agent", () => {
    expect(describeDevice(undefined)).toBe("Passkey");
    expect(describeDevice("something-else")).toBe("Passkey");
  });
});

describe("toPublicPasskey", () => {
  const row = {
    id: 7,
    label: "iPhone",
    deviceType: "multiDevice",
    backedUp: true,
    createdAt: new Date("2026-01-01"),
    lastUsedAt: new Date("2026-02-01"),
  };

  it("never exposes key material or the signature counter", () => {
    const publicPasskey = toPublicPasskey({
      ...row,
      // Simulates the full row: extra columns must not ride along.
      ...({ publicKey: "should-not-appear", counter: 42 } as object),
    });
    expect(JSON.stringify(publicPasskey)).not.toContain("should-not-appear");
    expect(publicPasskey).not.toHaveProperty("counter");
    expect(publicPasskey).not.toHaveProperty("publicKey");
  });

  it("reports a synced passkey as recoverable", () => {
    expect(toPublicPasskey(row).synced).toBe(true);
    expect(
      toPublicPasskey({ ...row, deviceType: "singleDevice", backedUp: false })
        .synced
    ).toBe(false);
  });

  it("labels an unnamed passkey rather than showing a blank row", () => {
    expect(toPublicPasskey({ ...row, label: null }).label).toBe("Passkey");
  });
});
