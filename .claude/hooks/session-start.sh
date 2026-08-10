#!/usr/bin/env bash
#
# SessionStart hook for Claude Code on the web.
#
# A remote session starts from a fresh container: no node_modules, no Doppler
# CLI, and no `doppler login` state — that login is per-machine and never
# travels here. This gets the container to the point where `pnpm verify` and
# `pnpm dev:doppler` work, and then gets out of the way.
#
# Secrets: the only thing this script needs is DOPPLER_TOKEN, supplied as an
# environment variable on the Claude Code environment. It is read but never
# echoed, never written to disk, and never passed as a command argument — the
# same rule scripts/doppler-bootstrap.sh follows. Nothing here prints a secret
# value; `--only-names` is deliberate.
#
# See docs/runbooks/secrets.md and AGENTS.md rule 2.
set -euo pipefail

# Local machines have their own toolchain and a real `doppler login`; this is
# only for the ephemeral remote container.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }

# --- 1. Dependencies --------------------------------------------------------
# `pnpm install`, not `--frozen-lockfile`: the container image is cached after
# this hook completes, and a plain install reuses that store on later sessions.
bold "Installing dependencies"
corepack enable >/dev/null 2>&1 || true
pnpm install --prefer-offline
ok "pnpm install complete"

# --- 2. Doppler CLI ---------------------------------------------------------
# Without a token there is nothing to authenticate, so skip the install
# entirely rather than leaving a CLI that can only fail.
bold "Configuring secrets"

if [ -z "${DOPPLER_TOKEN:-}" ]; then
  warn "DOPPLER_TOKEN not set — skipping Doppler setup"
  warn "Add it to this environment's variables, then start a NEW session:"
  warn "  a variable added mid-session is not visible until the next container"
  warn "Without it: pnpm check/test/build still work; pnpm dev:doppler does not"
  exit 0
fi

if ! command -v doppler >/dev/null 2>&1; then
  # Doppler's installer prefers apt and falls back to a static binary. Either
  # is fine; only the resulting `doppler` on PATH matters.
  if curl -sLf --retry 3 --retry-delay 2 https://cli.doppler.com/install.sh |
    sh -s -- --no-package-manager >/dev/null 2>&1; then
    ok "doppler CLI installed"
  else
    warn "could not install the Doppler CLI — continuing without it"
    warn "pnpm check/test/build are unaffected; pnpm dev:doppler will not work"
    exit 0
  fi
else
  ok "doppler $(doppler --version 2>/dev/null || echo present)"
fi

# --- 3. Verify the token ----------------------------------------------------
# A service token carries its own project and config, so no `doppler setup` is
# needed and doppler.yaml is not consulted. Names only — never values.
if ! SECRET_NAMES="$(doppler secrets --only-names --json 2>/dev/null)"; then
  warn "DOPPLER_TOKEN is set but Doppler rejected it"
  warn "Check it has not expired and is scoped to trip-harmony; see docs/runbooks/secrets.md"
  exit 0
fi

# Parsed with node rather than grep: `--json` is not guaranteed to be
# pretty-printed, and a line-counting heuristic silently reports 0 when it is
# not. Node is already a hard requirement of this repo.
COUNT="$(printf '%s' "$SECRET_NAMES" | node -e '
  let s = "";
  process.stdin.on("data", d => (s += d)).on("end", () => {
    try { console.log(Object.keys(JSON.parse(s)).length); } catch { console.log("?"); }
  });
' 2>/dev/null || echo "?")"

PROJECT="$(doppler configure get project --plain 2>/dev/null || true)"
CONFIG="$(doppler configure get config --plain 2>/dev/null || true)"
if [ -n "$PROJECT" ] && [ -n "$CONFIG" ]; then
  ok "doppler authenticated — ${COUNT} secrets in ${PROJECT}/${CONFIG}"
else
  # A service token carries its own scope and writes no config file, so these
  # lookups come back empty. That is the expected case here, not a problem.
  ok "doppler authenticated — ${COUNT} secrets in this token's scope"
fi

# Surface the gap between what env.ts requires and what this config actually
# holds. Names on both sides, so this stays safe to print.
MISSING=""
for KEY in DATABASE_URL JWT_SECRET; do
  printf '%s' "$SECRET_NAMES" | grep -q "\"${KEY}\"" || MISSING="${MISSING} ${KEY}"
done
[ -n "$MISSING" ] && warn "declared in env.ts but absent from this config:${MISSING}"

bold "Ready. Run the app against Doppler with:  pnpm dev:doppler"
