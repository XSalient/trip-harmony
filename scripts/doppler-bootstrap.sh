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
# file, and never placed anywhere your shell history can reach. Nothing here
# ever reads a value back out — presence is checked by name alone.
#
# Coverage: this script prompts for every variable in server/_core/env.ts that
# needs a human decision, and deliberately skips the ones that don't — see
# SKIPPED below, which names each and why. Those two lists together must
# account for the whole schema; the script checks that at the end and tells you
# when env.ts has grown a variable it doesn't know about. So when you add a
# variable to env.ts, add it here (to a prompt or to SKIPPED) and to
# .env.example. See docs/runbooks/secrets.md.

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

# Every value below is typed at a prompt, so a redirected or piped stdin can
# only half-configure the environment: `read` hits EOF, and the run stops
# partway with some variables set and the rest silently missing. Refuse up
# front instead — dashboard.doppler.com is the answer when there is no
# terminal to hand.
[ -t 0 ] || {
  echo "This script prompts for values and needs a terminal on stdin." >&2
  echo "Run it interactively, or use dashboard.doppler.com instead." >&2
  exit 1
}

echo "==> Project '$PROJECT', config '$CONFIG'"

doppler projects get "$PROJECT" >/dev/null 2>&1 ||
  doppler projects create "$PROJECT"

doppler configs get "$CONFIG" --project "$PROJECT" >/dev/null 2>&1 ||
  doppler configs create "$CONFIG" --project "$PROJECT"

# --- helpers ----------------------------------------------------------------

# Names of everything already in the config, fetched once. `--only-names`
# returns `{"NAME":{}, …}` — the names with the values withheld server-side,
# which is the whole reason the presence check uses it rather than reading a
# secret back and discarding it.
EXISTING="$(doppler secrets --project "$PROJECT" --config "$CONFIG" \
  --only-names --json)"

have() {
  case "$EXISTING" in *"\"$1\":"*) return 0 ;; *) return 1 ;; esac
}

# Every variable this script knows how to ask for, in the order it asks.
# Compared against env.ts at the end.
PROMPTED=""

# Prompts once and pipes the value in. Skips anything already set, so the
# script is safe to re-run.
set_secret() {
  local name="$1" prompt="$2" secret="${3:-yes}" value

  PROMPTED="$PROMPTED $name"

  if have "$name"; then
    echo "  = $name already set, leaving it alone"
    return
  fi

  # `|| :` so an interrupted read (Ctrl-D at a prompt) skips this one variable
  # rather than tripping `set -e` and abandoning the rest of the run.
  if [ "$secret" = "yes" ]; then
    read -rsp "  ? $name — $prompt: " value || :
    echo
  else
    read -rp "  ? $name — $prompt: " value || :
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

# Sets a value this script decides rather than asks for.
set_fixed() {
  local name="$1" value="$2"

  PROMPTED="$PROMPTED $name"
  printf '%s' "$value" |
    doppler secrets set "$name" --project "$PROJECT" --config "$CONFIG" \
      --no-interactive >/dev/null
  echo "  + $name=$value"
}

# Asks a yes/no question, defaulting to no.
confirm() {
  local reply
  read -rp "  ? $1 [y/N]: " reply || :
  case "$reply" in [yY] | [yY][eE][sS]) return 0 ;; *) return 1 ;; esac
}

# --- non-secret settings ----------------------------------------------------

case "$CONFIG" in
dev) APP_ENV_VALUE=development ;;
stg) APP_ENV_VALUE=preview ;;
prd) APP_ENV_VALUE=production ;;
esac

echo "==> Environment"
set_fixed APP_ENV "$APP_ENV_VALUE"

# --- required in every deployed environment ---------------------------------

echo "==> Required"

# Use a POOLER host for anything serverless — Vercel functions open many
# short-lived connections and exhaust a direct pool, and the direct Supabase
# host is AAAA-only, which Vercel cannot reach at all. Port 5432 (session
# pooler), not 6543: the deploy migration's advisory lock needs session
# semantics. See docs/runbooks/database.md. Percent-encode the password —
# # & @ : / ? are all URI-significant and will silently mis-parse otherwise.
set_secret DATABASE_URL "session-pooler Postgres URL (:5432), password percent-encoded"

if [ "$CONFIG" = "dev" ]; then
  echo "  = JWT_SECRET optional locally; generate one anyway with:"
  echo "      openssl rand -base64 48"
fi
set_secret JWT_SECRET "session signing key, 32+ chars (openssl rand -base64 48)"

# --- optional ---------------------------------------------------------------

echo "==> App — press Enter to skip any of these"
set_secret PUBLIC_BASE_URL "public origin, e.g. https://www.backtotravelling.com" no
set_secret OWNER_OPEN_ID "openId granted the admin role on sign-in" no
set_secret OAUTH_SERVER_URL "legacy Manus OAuth portal; blank unless you use it" no

echo "==> AI provider — blank leaves AI features returning an error"
set_secret AI_INTEGRATIONS_GEMINI_API_KEY "Gemini API key"
set_secret AI_INTEGRATIONS_GEMINI_BASE_URL "Gemini base URL, if not the default" no
set_secret BUILT_IN_FORGE_API_KEY "Forge API key, if used"
set_secret BUILT_IN_FORGE_API_URL "Forge base URL, if used" no

# Resend first, SMTP as the fallback — serverless platforms commonly block
# outbound SMTP ports. With neither, mail is written to the log instead.
echo "==> Email — blank means magic links are logged, not sent"
set_secret RESEND_API_KEY "Resend API key"
set_secret MAIL_FROM "from address for outbound mail" no
set_secret MAIL_PROVIDER "pin one provider: resend | smtp (blank tries both)" no

if confirm "configure SMTP as the fallback?"; then
  set_secret SMTP_HOST "SMTP hostname" no
  set_secret SMTP_PORT "SMTP port (587 for STARTTLS)" no
  set_secret SMTP_USER "SMTP username"
  set_secret SMTP_PASS "SMTP password"
  set_secret SMTP_FROM "SMTP envelope sender, if it differs from MAIL_FROM" no
else
  # Named so the coverage check below stays satisfied without setting them.
  PROMPTED="$PROMPTED SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS SMTP_FROM"
  echo "  - SMTP_* skipped"
fi

# The key alone switches this rung on: env.ts defaults the provider to
# scrapingowl when SCRAPER_API_KEY is set and SCRAPER_PROVIDER is not. Write
# the provider however the vendor's dashboard writes it — the name is reduced
# to the vendor before lookup, so a domain or a full endpoint URL resolves the
# same as the bare name. A vendor with no preset needs SCRAPER_ENDPOINT, and
# nothing else.
echo "==> Listing scraper fallback — blank leaves it off"
set_secret SCRAPER_API_KEY "unblocking-service API key"
set_secret SCRAPER_PROVIDER \
  "vendor name, domain or endpoint — scrapingowl, scraperapi.com, zenrows … (blank = scrapingowl)" no

SCRAPER_OVERRIDES="SCRAPER_ENDPOINT SCRAPER_METHOD SCRAPER_URL_PARAM
  SCRAPER_API_KEY_PARAM SCRAPER_API_KEY_IN SCRAPER_RENDER_PARAM SCRAPER_PARAMS
  SCRAPER_HTML_PATH SCRAPER_RENDER_JS SCRAPER_TIMEOUT_MS SCRAPER_HOSTS"

# Every preset field is also a variable, so a vendor with no preset is these
# plus an endpoint. Off the beaten path for anyone using a preset, hence the
# gate — see .env.example for what each one means.
if confirm "override individual scraper fields (only needed for a vendor with no preset)?"; then
  set_secret SCRAPER_ENDPOINT "full scrape endpoint URL" no
  set_secret SCRAPER_METHOD "GET | POST" no
  set_secret SCRAPER_URL_PARAM "parameter carrying the listing URL" no
  set_secret SCRAPER_API_KEY_PARAM "parameter or header carrying the key" no
  set_secret SCRAPER_API_KEY_IN "query | header | body | basic" no
  set_secret SCRAPER_RENDER_PARAM "parameter asking for a rendered page, or 'none'" no
  set_secret SCRAPER_PARAMS "extra params, 'a=b&c=d' or a JSON object" no
  set_secret SCRAPER_HTML_PATH "dotted path to the HTML in a JSON reply, or 'none'" no
  set_secret SCRAPER_RENDER_JS "run the page's JavaScript (default true)" no
  set_secret SCRAPER_TIMEOUT_MS "per-request budget in ms (default 30000)" no
  set_secret SCRAPER_HOSTS "comma-separated hosts to spend quota on (blank = all)" no
else
  PROMPTED="$PROMPTED $SCRAPER_OVERRIDES"
  echo "  - scraper overrides skipped; the preset's own values are used"
fi

# --- coverage ---------------------------------------------------------------

# Variables env.ts declares that this script intentionally never asks about,
# with the reason. Anything in neither this list nor PROMPTED is a gap, and the
# check below is what keeps the header's claim honest.
SKIPPED="
NODE_ENV                 set by env.ts from APP_ENV
PORT                     defaults to 5000; the platform overrides it
LOG_LEVEL                defaults by environment
VITE_APP_ID              build-time constant, not per-environment
POSTGRES_URL             set by the Supabase/Vercel integration
POSTGRES_URL_NON_POOLING set by the Supabase/Vercel integration
"

SKIPPED_NAMES="$(printf '%s\n' "$SKIPPED" | awk 'NF {print $1}')"
# Both lists are matched a name at a time with spaces either side, so every
# run of whitespace — the newlines in SCRAPER_OVERRIDES especially — has to
# collapse to a single space first.
KNOWN=" $(printf '%s %s' "$PROMPTED" "$SKIPPED_NAMES" | tr -s '[:space:]' ' ') "

ENV_TS="$(dirname "$0")/../server/_core/env.ts"
if [ -r "$ENV_TS" ]; then
  missing=""
  for name in $(awk '/^const schema = z.object\(\{/,/^\}\);/' "$ENV_TS" |
    grep -oE '^  [A-Z][A-Z0-9_]*:' | tr -d ' :'); do
    case "$KNOWN" in *" $name "*) continue ;; esac
    missing="$missing $name"
  done
  if [ -n "$missing" ]; then
    echo
    echo "!! server/_core/env.ts declares variables this script does not handle:" >&2
    for name in $missing; do echo "     $name" >&2; done
    echo "   Add each to a prompt above or to SKIPPED, and to .env.example." >&2
  fi
fi

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
       doppler run --config $CONFIG -- pnpm diagnose:url --check-scraper
       pnpm db:status:doppler        # production only

Nothing above wrote a secret to disk. Do not run 'doppler secrets download'.
EOF
