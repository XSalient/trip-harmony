# 0007. Passkeys as a first-class sign-in method

- Status: Accepted
- Date: 2026-08-01

## Context

Harmony had two ways in: an emailed magic link and an email/password pair. Both
have known failure modes we had already been forced to work around — see
`auth.capabilities`, which exists solely because a magic link that cannot be
delivered must not be offered.

The password route has the usual problems (reuse, phishing, typing a password on
a phone). The link route depends on mail delivery, the slowest and least
reliable dependency in the stack, and on the user leaving the app to fetch it.
For an app people mostly open on a phone, neither is good.

WebAuthn/passkeys removes both: the credential is a key pair held by the device's
secure element, unlocked with the biometric or PIN the user already uses, and the
private key never leaves the authenticator. There is no shared secret to steal
from our database and nothing to phish — the browser will not release an
assertion to a site other than the one the passkey was created for.

## Decision

Add passkeys as a third sign-in method, built on `@simplewebauthn` (server and
browser). A dependency rather than a hand-rolled implementation: verification
means CBOR decoding, COSE key parsing and signature checking, and getting any of
that subtly wrong fails open.

Three choices worth recording:

**Additive, never required.** Passwords and magic links stay. A passkey lives on
a device; someone who only has a passkey and loses the device must still have a
way in. The profile page therefore presents all three together, and the sign-in
dialog only offers a passkey when `browserSupportsWebAuthn()` says the browser
can produce one.

**Sign-in is usernameless.** `passkeys.startAuthentication` sends an empty
`allowCredentials`, so the browser offers whichever discoverable passkey it holds
for this site. The user taps once and authenticates — no email typed first.
Registration asks for `residentKey: "preferred"` rather than `"required"` so
hardware keys with no storage for a discoverable credential can still enrol,
losing only usernameless sign-in.

**The relying party comes from `PUBLIC_BASE_URL`, not the `Host` header.**
Deriving the expected origin from the request would let a phishing site that
proxies to us nominate itself as the relying party, which is precisely the attack
passkeys exist to defeat. The header is used only as a fallback when nothing is
configured, for local and preview work where the URL is not known ahead of time.

Challenges are single-use rows in `webauthn_challenges` with a five-minute
expiry, keyed by an opaque id the client echoes back. Serverless instances share
no memory, so they cannot be held in the process.

## Consequences

- Sign-in on a phone becomes one tap, with no inbox round-trip and no typing.
- Nothing in `webauthn_credentials` is worth stealing: public keys only.
- Two new tables and one new dependency. `@simplewebauthn` is the cost of not
  writing our own attestation parser, which is the right trade.
- `PUBLIC_BASE_URL` moves from a convenience to something a deployment should
  set. Unset, passkeys still work but rest on the `Host` header.
- Three sign-in methods is more surface to keep working than two. The profile
  page exists partly to make that state visible in one place.
- Passkeys are per-device unless the platform syncs them (iCloud Keychain,
  Google Password Manager). The UI says which kind each one is, because
  "this device only" is what a user needs to know before relying on it.
