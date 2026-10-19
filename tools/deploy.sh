#!/usr/bin/env bash
# Redeploy: copy site files to /workspace/bowatch-public, then push a new version to the same flypod URL.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"; SITE="${FLYPOD_SITE:-87ff2e09478743d4}"
node "$DIR/check.mjs" >/dev/null || { echo "check.mjs failed — not deploying"; exit 1; }
"$DIR/publish.sh" /workspace/bowatch-public
cd /workspace/bowatch-public && npx -y flypod@0.16.1 update . --site "$SITE" --json
