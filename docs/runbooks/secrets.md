# Secrets

**Doppler is the source of truth.** Nothing secret belongs in git, in a chat
message, or in a file that outlives a session. See
[ADR-0003](../adr/0003-doppler-for-secrets.md) for why.

## Layout

| Doppler config | `APP_ENV`     | Used by                               |
| -------------- | ------------- | ------------------------------------- |
| `dev`          | `development` | Local development                     |
| `stg`          | `preview`     | Vercel preview deployments (every PR) |
| `prd`          | `production`  | Production                            |

`doppler.yaml` binds this repository to project `trip-harmony`, config `dev`.

## Day-to-day

```bash
doppler login
doppler setup                        # reads doppler.yaml
pnpm dev:doppler                     # run the app with dev secrets injected

doppler secrets                      # list (values masked in shared terminals)
doppler secrets set JWT_SECRET=…     # set one
doppler secrets --config prd         # inspect another environment
doppler run --config stg -- pnpm dev # run locally against preview secrets
```

Never `doppler secrets download` to a file unless you are offline, and delete it
when you're done — a downloaded `.env` is exactly the artifact Doppler exists to
avoid.

## Feeding Vercel

Use Doppler's Vercel integration (Doppler → Integrations → Vercel) and map:

| Doppler config | Vercel environment |
| -------------- | ------------------ |
| `prd`          | Production         |
| `stg`          | Preview            |

Doppler then pushes changes automatically; Vercel environment variables are never
edited by hand. Redeploy for a change to take effect — Vercel injects env vars at
build/boot, not per request.

## Variables

`server/_core/env.ts` is the authority; `.env.example` is the documented
contract. Adding a variable means updating **both**, plus this table.

### Required in preview and production

| Variable       | Purpose               | Notes                                                                                                                                   |
| -------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL` | Postgres connection   | Or `POSTGRES_URL` / `POSTGRES_URL_NON_POOLING` from the Supabase integration. Boot fails if none is a usable Postgres URL when deployed |
| `JWT_SECRET`   | Signs session cookies | ≥ 32 chars. Rotating it signs everyone out                                                                                              |

### Runtime

| Variable          | Default                        | Purpose                                                       |
| ----------------- | ------------------------------ | ------------------------------------------------------------- |
| `APP_ENV`         | derived                        | `development` \| `test` \| `preview` \| `production`          |
| `PORT`            | `5000`                         | Ignored on Vercel                                             |
| `LOG_LEVEL`       | `debug` local, `info` deployed | `debug`…`silent`                                              |
| `PUBLIC_BASE_URL` | —                              | Origin for magic links, invites and the passkey relying party |
| `VITE_APP_ID`     | `harmony`                      | Application identifier                                        |
| `OWNER_OPEN_ID`   | —                              | This user is granted `admin` on sign-in                       |

### Optional — the app runs without them

| Variable                                                            | Missing behaviour                                                                                                                                  |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AI_INTEGRATIONS_GEMINI_API_KEY`, `AI_INTEGRATIONS_GEMINI_BASE_URL` | AI features (referee, NL date parsing, URL import, match analysis) return an error; everything else is unaffected                                  |
| `BUILT_IN_FORGE_API_KEY`, `BUILT_IN_FORGE_API_URL`                  | Legacy aliases; take precedence over the Gemini pair when set                                                                                      |
| `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_PROVIDER`                      | No Resend delivery. `MAIL_FROM` must be a verified domain or Resend only delivers to the account owner — the sign-in UI hides passwordless when so |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`     | SMTP fallback unavailable. With no provider at all, magic links and invites are logged at `warn` instead of emailed — intended local behaviour     |
| `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`                          | Only consulted when `DATABASE_URL` is unset; set by the Supabase/Vercel integration                                                                |
| `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL`                         | Legacy Manus portal stays disabled; email and magic-link sign-in are unaffected                                                                    |

`GET /api/health` reports which of these are configured, without revealing values.

## Rotation

1. Generate the new value.
2. `doppler secrets set NAME=… --config prd`
3. Redeploy (Vercel picks up the change at build/boot).
4. Revoke the old credential at its provider.

Rotating `JWT_SECRET` invalidates every session — users must sign in again. Do it
deliberately, and immediately if it may have leaked.

## If a secret leaks

1. Revoke it at the provider first. Do not start with the git history.
2. Set a new value in Doppler and redeploy.
3. If it was committed, rewrite history (`git filter-repo`) and force-push, then
   tell every collaborator to re-clone. Assume the old value is public regardless
   — it was in a clone, a CI log or a fork the moment it was pushed.
4. Note the incident in [../CHANGELOG.md](../CHANGELOG.md) without naming the value.

## Rules

- Never commit a real value. `.env` and `.env.*` are git-ignored;
  `.env.example` is the one exception and holds placeholders only.
- Never log a secret. The logger redacts common key names, but that is a
  backstop, not permission.
- Never send a secret over chat or email. Grant Doppler access instead.
- Never reuse a production secret in preview or local. That is what separate
  configs are for.
