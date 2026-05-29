#!/usr/bin/env bash
# Pre-deploy smoke test wrapper — Phase 3 audit defense.
#
# Asegura que el smoke test corre con Node 18+ (fetch global requerido) +
# desde el directorio correcto (apps/api).
#
# Uso desde cualquier directorio:
#   ./apps/api/prisma/scripts/smoke-test.sh
#
# O desde apps/api:
#   ./prisma/scripts/smoke-test.sh
#
# Exit codes pass-through del TypeScript:
#   0 → safe to deploy
#   1 → al menos un check failed
#   2 → script crashed (FATAL)
set -e

# Find apps/api directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$API_DIR"

# Source nvm if available; switch to Node 22+ for fetch global
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh"

  # Pick latest available Node >= 18 from nvm
  NVM_NODE=$(nvm version-remote 22 2>/dev/null || nvm version-remote 20 2>/dev/null || nvm version-remote 18 2>/dev/null)
  if [ -n "$NVM_NODE" ]; then
    nvm use --silent "$NVM_NODE" >/dev/null 2>&1 || nvm use --silent 22 >/dev/null 2>&1 || nvm use --silent 20 >/dev/null 2>&1 || nvm use --silent 18 >/dev/null 2>&1
  fi
fi

NODE_VERSION=$(node --version 2>/dev/null || echo "v0.0.0")
NODE_MAJOR=$(echo "$NODE_VERSION" | sed -E 's/^v?([0-9]+).*/\1/')

if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "❌ smoke-test requires Node >= 18 (got $NODE_VERSION) — fetch is not defined in older Node."
  echo "   Install Node 22+ with nvm: nvm install 22 && nvm use 22"
  exit 3
fi

echo "Using Node $NODE_VERSION"
npx ts-node -r tsconfig-paths/register prisma/scripts/smoke-test-pre-deploy.ts "$@"
