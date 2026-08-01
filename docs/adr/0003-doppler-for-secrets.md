# 0003. Doppler as the source of truth for secrets

- Status: Accepted
- Date: 2026-08-01

## Context

Developers work from different machines, and AI agents run in ephemeral cloud
containers that are destroyed between sessions. `.env` files handed around
manually don't survive that, and they rot: nobody knows which values are current,
and rotating a leaked key means chasing every copy.

The app needs secrets in at least three environments — local, preview and
production — and the values legitimately differ per environment.

## Decision

Doppler holds every secret, in three configs: `dev`, `stg` (preview), `prd`
(production). `doppler.yaml` binds the repository to the project so a new
developer runs `doppler login && doppler setup` and has working credentials
without a file ever touching disk.

Deployed environments get their values from Vercel environment variables, synced
from Doppler by Doppler's Vercel integration, so Doppler stays the single source
of truth.

A `.env` file remains supported for offline work and for contributors without
Doppler access. `.env.example` documents every variable and is the contract that
`server/_core/env.ts` validates against.

## Consequences

- Onboarding is two commands, on any machine, with no secret sharing over chat.
- Rotation happens in one place and propagates.
- Access is per-person and revocable; leavers lose access immediately.
- Adds an external dependency and an account requirement for full local setup.
  Mitigated by keeping the `.env` path working.
- The rule "never commit a secret" is now enforceable, because there is no reason
  to have one on disk.
