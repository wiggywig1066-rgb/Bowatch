#!/usr/bin/env bash
# Copies the site files (no .git, no tools, no POS data) to the folder the box tunnel serves.
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"; OUT="${1:-/workspace/bowatch-public}"
mkdir -p "$OUT"
rm -rf "$OUT"/* && cp -r "$SRC/index.html" "$SRC/favicon.svg" "$SRC/manifest.webmanifest" "$SRC/css" "$SRC/js" "$SRC/data" "$OUT/"
rm -f "$OUT/data/pos.csv" "$OUT/data/daily.csv" "$OUT"/data/*.pos.csv "$OUT"/data/*.daily.csv  # never publish sales data
echo "published to $OUT"
