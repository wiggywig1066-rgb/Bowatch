#!/usr/bin/env bash
# Copy the static site to a local folder. Does not deploy.
# GitHub Actions publishes the repo itself; use this only for a local mirror.
# Sales CSVs are stripped even if one was left in data/.
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-/tmp/bowatch-public}"
mkdir -p "$OUT"
rm -rf "$OUT"/*
cp "$SRC/index.html" "$SRC/favicon.svg" "$SRC/icon-192.png" "$SRC/icon-512.png" "$SRC/sw.js" "$SRC/manifest.webmanifest" "$OUT/"
cp -r "$SRC/css" "$SRC/js" "$SRC/data" "$OUT/"
rm -f "$OUT/data/pos.csv" "$OUT/data/daily.csv" "$OUT"/data/*.pos.csv "$OUT"/data/*.daily.csv
echo "published to $OUT"
