#!/usr/bin/env bash
# Run the forecast checks locally. Publishing is GitHub Actions on main,
# which deploys this repo to GitHub Pages. This script does not upload anywhere.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
node "$DIR/check.mjs" --offline
node --test "$DIR/forecast.test.mjs"
echo "Checks passed."
echo "Push to main to publish https://wiggywig1066-rgb.github.io/Bowatch/"
