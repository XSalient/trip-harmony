/**
 * Passkey (WebAuthn) enrolment and sign-in.
 *
 * A passkey replaces the password with the unlock the device already has —
 * Face ID, Touch ID, Windows Hello, or a hardware key. The private key never
 * leaves the authenticator; the server only ever stores a public key, so there
 * is nothing here worth stealing.
 *
 * Registration requires a session (you must already be signed in to add one).
 * Sign-in is public and usernameless: no `allowCredentials` is sent, so the
 * browser offers whichever discoverable passkey it holds for this site.
 */
import type { Request } from "express";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc.js";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import * as db from "../db.js";
import { issueSession } from "./_shared.js";
import { config } from "../_core/env.js";
import { logger } from "../_core/logger.js";

const log = logger.child({ scope: "passkeys" });

const RP_NAME = "WeVoTrip";
/** Long enough for a user to find their phone, short enough to limit replay. */
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/**
 * The origin and RP ID a passkey is bound to.
 *
 * The configured base URL wins whenever there is one: deriving the expected
 * origin from the request's own `Host` header would let a proxying phishing
 * site have its assertions accepted, which is exactly the attack passkeys
 * exist to stop. The header is only a fallback for local and preview work,
 * where the URL is not known ahead of time.
 *
 * Exported for the tests — nothing outside this router should need it.
 */
export function resolveRelyingParty(
  configuredBaseUrl: string,
  requestOrigin: string
) {
  const url = new URL(configuredBaseUrl || requestOrigin);
  return { origin: url.origin, rpID: url.hostname };
}

/**
 * Android's origin for a passkey, derived from the app's signing certificate.
 *
 * A passkey assertion from an Android app does not carry an `https://` origin.
 * It carries `android:apk-key-hash:<base64url of the SHA-256 certificate
 * digest>` — the same certificate `assetlinks.json` publishes as colon-hex, in
 * a different encoding. Both describe the app; only this form appears in an
 * assertion.
 *
 * Returns null when there is no fingerprint configured, or when it is not the
 * 32 bytes a SHA-256 digest has. Null means "do not expect this origin", which
 * is the safe direction: an origin allow-list built from a malformed value
 * would either reject every Android assertion or, worse, accept a shorter one.
 *
 * iOS needs no equivalent. An app associated with the domain through
 * `webcredentials` in the AASA presents the domain's own `https://` origin, so
 * it already matches the web's.
 */
export function androidPasskeyOrigin(fingerprint: string): string | null {
  const hex = fingerprint.replace(/[^0-9a-fA-F]/g, "");
  if (hex.length !== 64) return null;
  const bytes = Buffer.from(hex, "hex");
  if (bytes.length !== 32) return null;
  return `android:apk-key-hash:${bytes.toString("base64url")}`;
}

/**
 * Every origin an assertion for this deployment may legitimately carry.
 *
 * The web's, always. Android's, when the signing certificate is configured.
 *
 * Widening this is the one change the native builds need, and it is worth being
 * precise about *why* it is safe: `expectedRPID` still pins the assertion to
 * this domain, and the Android entry is derived from a certificate only the
 * holder of the signing key can produce. It is not "accept more origins" — it
 * is "this one app, on a second platform".
 */
export function expectedPasskeyOrigins(
  webOrigin: string,
  androidFingerprint: string
): string[] {
  const android = androidPasskeyOrigin(androidFingerprint);
  return android ? [webOrigin, android] : [webOrigin];
}

function relyingParty(req: Request) {
  const proto = req.get("x-forwarded-proto") || req.protocol;
  return resolveRelyingParty(
    config.publicBaseUrl,
    `${proto}://${req.get("host")}`
  );
}

/** A recognisable name for the passkey list; the user can rename it afterwards. */
export function describeDevice(userAgent: string | undefined): string {
  const ua = userAgent ?? "";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android device";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows device";
  if (/Linux/i.test(ua)) return "Linux device";
  return "Passkey";
}

function splitTransports(
  value: string | null
): AuthenticatorTransportFuture[] | undefined {
  if (!value) return undefined;
  const parts = value.split(",").filter(Boolean);
  return parts.length ? (parts as AuthenticatorTransportFuture[]) : undefined;
}

/**
 * The browser's credential JSON, validated structurally.
 *
 * The fields are checked rather than trusted, but their *meaning* is verified
 * cryptographically by `@simplewebauthn/server` a moment later — this schema
 * only keeps malformed input from reaching it.
 */
/** Passed through untouched — verification never reads the extension outputs. */
const clientExtensionResults = z.unknown().optional();

const registrationResponseSchema = z.object({
  id: z.string(),
  rawId: z.string(),
  type: z.literal("public-key"),
  authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
  clientExtensionResults,
  response: z.object({
    clientDataJSON: z.string(),
    attestationObject: z.string(),
    authenticatorData: z.string().optional(),
    transports: z.array(z.string()).optional(),
    publicKeyAlgorithm: z.number().optional(),
    publicKey: z.string().optional(),
  }),
});

const authenticationResponseSchema = z.object({
  id: z.string(),
  rawId: z.string(),
  type: z.literal("public-key"),
  authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
  clientExtensionResults,
  response: z.object({
    clientDataJSON: z.string(),
    authenticatorData: z.string(),
    signature: z.string(),
    userHandle: z.string().optional(),
  }),
});

/** The passkey fields that are safe to send to a browser. */
export function toPublicPasskey(row: {
  id: number;
  label: string | null;
  deviceType: string | null;
  backedUp: boolean;
  createdAt: Date;
  lastUsedAt: Date | null;
}) {
  return {
    id: row.id,
    label: row.label ?? "Passkey",
    /** Synced passkeys survive losing the device; single-device ones do not. */
    synced: row.deviceType === "multiDevice" || row.backedUp,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  };
}

export const passkeysRouter = router({
  /** The signed-in user's enrolled passkeys. Never includes key material. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db.getWebauthnCredentialsByUser(ctx.user.id);
    return rows.map(toPublicPasskey);
  }),

  startRegistration: protectedProcedure.mutation(async ({ ctx }) => {
    const { origin, rpID } = relyingParty(ctx.req);
    const existing = await db.getWebauthnCredentialsByUser(ctx.user.id);
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID,
      // Stable per account, so re-enrolling on the same device replaces the old
      // passkey instead of leaving a second, confusing entry behind.
      userID: new TextEncoder().encode(ctx.user.openId),
      userName: ctx.user.email || ctx.user.name || ctx.user.openId,
      userDisplayName: ctx.user.name || ctx.user.email || "WeVoTrip traveller",
      attestationType: "none",
      excludeCredentials: existing.map(c => ({
        id: c.credentialId,
        transports: splitTransports(c.transports),
      })),
      authenticatorSelection: {
        // Discoverable so sign-in can be usernameless; "preferred" rather than
        // "required" because some hardware keys have no room to store one.
        residentKey: "preferred",
        userVerification: "preferred",
      },
    });

    const challengeId = nanoid(32);
    await db.createWebauthnChallenge({
      challengeId,
      challenge: options.challenge,
      userId: ctx.user.id,
      purpose: "registration",
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    });
    // Cheap to do here, and saves needing a scheduled job for a small table.
    void db.deleteExpiredWebauthnChallenges().catch(err => {
      log.warn("failed to prune expired challenges", { err });
    });

    log.info("passkey registration started", { rpID, origin });
    return { challengeId, options };
  }),

  finishRegistration: protectedProcedure
    .input(
      z.object({
        challengeId: z.string().min(1),
        response: registrationResponseSchema,
        label: z.string().trim().max(64).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const stored = await db.consumeWebauthnChallenge(
        input.challengeId,
        "registration"
      );
      if (!stored || stored.userId !== ctx.user.id)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This passkey request expired. Please try again.",
        });

      const { origin, rpID } = relyingParty(ctx.req);
      let verification;
      try {
        verification = await verifyRegistrationResponse({
          response: input.response as RegistrationResponseJSON,
          expectedChallenge: stored.challenge,
          expectedOrigin: expectedPasskeyOrigins(
            origin,
            config.native.androidCertFingerprint
          ),
          expectedRPID: rpID,
          requireUserVerification: false,
        });
      } catch (error) {
        log.warn("passkey registration rejected", { err: error });
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "We couldn't verify that passkey. Please try again.",
        });
      }

      if (!verification.verified)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "We couldn't verify that passkey. Please try again.",
        });

      const { credential, credentialDeviceType, credentialBackedUp } =
        verification.registrationInfo;

      await db.createWebauthnCredential({
        userId: ctx.user.id,
        credentialId: credential.id,
        publicKey: isoBase64URL.fromBuffer(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports?.join(",") ?? null,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        label: input.label?.trim() || describeDevice(ctx.req.get("user-agent")),
      });

      log.info("passkey registered", {
        userId: ctx.user.id,
        deviceType: credentialDeviceType,
      });
      return { success: true } as const;
    }),

  startAuthentication: publicProcedure.mutation(async ({ ctx }) => {
    const { rpID } = relyingParty(ctx.req);
    const options = await generateAuthenticationOptions({
      rpID,
      // Deliberately empty: the browser picks from the passkeys it already has
      // for this site, so the user never types an email address.
      allowCredentials: [],
      userVerification: "preferred",
    });

    const challengeId = nanoid(32);
    await db.createWebauthnChallenge({
      challengeId,
      challenge: options.challenge,
      userId: null,
      purpose: "authentication",
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    });

    return { challengeId, options };
  }),

  finishAuthentication: publicProcedure
    .input(
      z.object({
        challengeId: z.string().min(1),
        response: authenticationResponseSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const stored = await db.consumeWebauthnChallenge(
        input.challengeId,
        "authentication"
      );
      if (!stored)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "This sign-in request expired. Please try again.",
        });

      const credential = await db.getWebauthnCredentialById(input.response.id);
      // Same message for an unknown passkey as for a bad signature: which one
      // it was is not the caller's business.
      const rejected = new TRPCError({
        code: "UNAUTHORIZED",
        message: "That passkey isn't recognised. Try another sign-in method.",
      });
      if (!credential) throw rejected;

      const { origin, rpID } = relyingParty(ctx.req);
      let verification;
      try {
        verification = await verifyAuthenticationResponse({
          response: input.response as AuthenticationResponseJSON,
          expectedChallenge: stored.challenge,
          expectedOrigin: expectedPasskeyOrigins(
            origin,
            config.native.androidCertFingerprint
          ),
          expectedRPID: rpID,
          credential: {
            id: credential.credentialId,
            publicKey: isoBase64URL.toBuffer(credential.publicKey),
            counter: credential.counter,
            transports: splitTransports(credential.transports),
          },
          requireUserVerification: false,
        });
      } catch (error) {
        log.warn("passkey authentication rejected", { err: error });
        throw rejected;
      }

      if (!verification.verified) throw rejected;

      const user = await db.getUserById(credential.userId);
      if (!user) throw rejected;

      await db.touchWebauthnCredential(
        credential.id,
        verification.authenticationInfo.newCounter
      );
      await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });

      const session = await issueSession(ctx, user);

      log.info("passkey sign-in", { userId: user.id });
      return { success: true, ...session } as const;
    }),

  rename: protectedProcedure
    .input(
      z.object({ id: z.number(), label: z.string().trim().min(1).max(64) })
    )
    .mutation(async ({ ctx, input }) => {
      const renamed = await db.renameWebauthnCredential(
        input.id,
        ctx.user.id,
        input.label
      );
      if (!renamed)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Passkey not found.",
        });
      return { success: true } as const;
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const removed = await db.deleteWebauthnCredential(input.id, ctx.user.id);
      if (!removed)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Passkey not found.",
        });
      log.info("passkey removed", { userId: ctx.user.id });
      return { success: true } as const;
    }),
});
