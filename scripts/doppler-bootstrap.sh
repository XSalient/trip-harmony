#!/usr/bin/env bash
#
# Creates the Doppler project and its three configs, then walks you through the
# secrets each deployed environment needs.
#
#   bash scripts/doppler-bootstrap.sh          # set up dev
#   bash scripts/doppler-bootstrap.sh prd      # set up production
#
# Run it yourself, on your own machine, after `doppler login`. It is written so
# that no secret is ever typed as a shell argument: values are read with
# `read -rs`, piped straight into Doppler, and never echoed, never written to a
# file, and never placed anywhere your shell history can reach.
#
# The variable list is derived from server/_core/env.ts — that file is the
# authority. If you add a variable there, add it here and to .env.example.
# See docs/runbooks/secrets.md.

set -euo pipefail

PROJECT="trip-harmony"
CONFIG="${1:-dev}"

case "$CONFIG" in
dev | stg | prd) ;;
*)
  echo "Config must be dev, stg or prd (got '$CONFIG')." >&2
  exit 1
  ;;
esac

command -v doppler >/dev/null 2>&1 || {
  echo "Doppler CLI not found. Install: https://docs.doppler.com/docs/install-cli" >&2
  exit 1
}

doppler me >/dev/null 2>&1 || {
  echo "Not logged in. Run 'doppler login' first." >&2
  exit 1
}

echo "==> Project '$PROJECT', config '$CONFIG'"

doppler projects get "$PROJECT" >/dev/null 2>&1 ||
  doppler projects create "$PROJECT"

doppler configs get "$CONFIG" --project "$PROJECT" >/dev/null 2>&1 ||
  doppler configs create "$CONFIG" --project "$PROJECT"

# --- helpers ----------------------------------------------------------------

have() {
  doppler secrets get "$1" --project "$PROJECT" --config "$CONFIG" \
    --plain >/dev/null 2>&1
}

# Prompts once and pipes the value in. Skips anything already set, so the
# script is safe to re-run.
set_secret() {
  local name="$1" prompt="$2" secret="${3:-yes}" value

  if have "$name"; then
    echo "  = $name already set, leaving it alone"
    return
  fi

  if [ "$secret" = "yes" ]; then
    read -rsp "  ? $name — $prompt: " value
    echo
  else
    read -rp "  ? $name — $prompt: " value
  fi

  if [ -z "$value" ]; then
    echo "  - $name skipped (empty)"
    return
  fi

  printf '%s' "$value" |
    doppler secrets set "$name" --project "$PROJECT" --config "$CONFIG" \
      --no-interactive >/dev/null
  echo "  + $name set"
}

# --- non-secret settings ----------------------------------------------------

case "$CONFIG" in
dev) APP_ENV_VALUE=development ;;
stg) APP_ENV_VALUE=preview ;;
prd) APP_ENV_VALUE=production ;;
esac

echo "==> Environment"
printf '%s' "$APP_ENV_VALUE" |
  doppler secrets set APP_ENV --project "$PROJECT" --config "$CONFIG" \
    --no-interactive >/dev/null
echo "  + APP_ENV=$APP_ENV_VALUE"

# --- required in every deployed environment ---------------------------------

echo "==> Required"

# Use the POOLED connection string (port 6543) for anything serverless: Vercel
# functions open many short-lived connections and exhaust a direct pool. The
# non-pooling host resolves over IPv6 only. Percent-encode the password —
# # & @ : / ? are all URI-significant and will silently mis-parse otherwise.
set_secret DATABASE_URL "pooled Postgres URL, password percent-encoded"

if [ "$CONFIG" = "dev" ]; then
  echo "  = JWT_SECRET optional locally; generate one anyway with:"
  echo "      openssl rand -base64 48"
fi
set_secret JWT_SECRET "session signing key, 32+ chars (openssl rand -base64 48)"

# --- optional ---------------------------------------------------------------

echo "==> Optional — press Enter to skip any of these"
set_secret PUBLIC_BASE_URL "public origin, e.g. https://www.backtotravelling.com" no
set_secret RESEND_API_KEY "Resend API key (email; SMTP is the fallback)"
set_secret MAIL_FROM "from address for outbound mail" no
set_secret AI_INTEGRATIONS_GEMINI_API_KEY "Gemini API key (AI features)"
set_secret BUILT_IN_FORGE_API_KEY "Forge API key, if used"

# --- verify -----------------------------------------------------------------

echo "==> Set in $PROJECT/$CONFIG:"
doppler secrets --project "$PROJECT" --config "$CONFIG" --only-names

cat <<EOF

Next:
  1. Repeat for the other configs:  bash scripts/doppler-bootstrap.sh stg
                                    bash scripts/doppler-bootstrap.sh prd
  2. Wire Doppler to Vercel (Doppler -> Integrations -> Vercel), mapping
     prd -> Production and stg -> Preview. After that, never edit a Vercel
     environment variable by hand; Doppler pushes them.
  3. Confirm the app agrees with what you set:
       doppler run --config $CONFIG -- pnpm check
       pnpm db:status:doppler        # production only

Nothing above wrote a secret to disk. Do not run 'doppler secrets download'.
EOF
