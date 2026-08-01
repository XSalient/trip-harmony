#!/usr/bin/env bash
# One-command bootstrap. Safe to re-run.
#
#   pnpm setup
#
# Gets a fresh clone — on any machine, in any cloud dev environment — to the
# point where `pnpm dev` works. Prints what is missing rather than guessing.
set -euo pipefail

cd "$(dirname "$0")/.."

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }

bold "Back To Travelling setup"

# --- 1. Toolchain -----------------------------------------------------------
REQUIRED_NODE_MAJOR=20
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install Node ${REQUIRED_NODE_MAJOR}+ from https://nodejs.org" >&2
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt "$REQUIRED_NODE_MAJOR" ]; then
  echo "Node ${NODE_MAJOR} found, but ${REQUIRED_NODE_MAJOR}+ is required." >&2
  exit 1
fi
ok "node $(node -v)"

if ! command -v pnpm >/dev/null 2>&1; then
  warn "pnpm not found — enabling via corepack"
  corepack enable >/dev/null 2>&1 || {
    echo "Could not enable corepack. Install pnpm manually: npm i -g pnpm" >&2
    exit 1
  }
fi
ok "pnpm $(pnpm -v)"

# --- 2. Dependencies --------------------------------------------------------
bold "Installing dependencies"
pnpm install
ok "dependencies installed"

# --- 3. Secrets -------------------------------------------------------------
bold "Configuring secrets"
if command -v doppler >/dev/null 2>&1; then
  if doppler configure get project >/dev/null 2>&1; then
    ok "doppler configured — run 'pnpm dev:doppler' (no .env file needed)"
  else
    warn "doppler installed but not linked. Run: doppler login && doppler setup"
  fi
elif [ -f .env ]; then
  ok ".env present"
else
  cp .env.example .env
  warn "created .env from .env.example — fill in DATABASE_URL and JWT_SECRET"
  warn "generate a secret: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
fi

# --- 4. Database ------------------------------------------------------------
bold "Checking database"
DB_URL="${DATABASE_URL:-$(grep -E '^DATABASE_URL=' .env 2>/dev/null | cut -d= -f2- || true)}"
if [ -n "$DB_URL" ]; then
  if pnpm db:push >/dev/null 2>&1; then
    ok "schema pushed"
  else
    warn "could not reach the database — check DATABASE_URL, then run 'pnpm db:push'"
  fi
else
  warn "DATABASE_URL not set — see docs/runbooks/local-setup.md for a local Postgres"
fi

# --- 5. Verify --------------------------------------------------------------
bold "Verifying"
pnpm check && ok "typecheck passed"
pnpm test  && ok "tests passed"

bold "Done. Start the app with:  pnpm dev"
echo "  Docs:    docs/README.md"
echo "  Agents:  AGENTS.md"
