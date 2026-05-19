#!/usr/bin/env bash
# Regenerate raster favicon assets from public/favicon.svg.
# Requires: brew install librsvg imagemagick
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PUBLIC_DIR="$SCRIPT_DIR/../public"
SVG="$PUBLIC_DIR/favicon.svg"

if [[ ! -f "$SVG" ]]; then
    echo "favicon.svg not found at $SVG" >&2
    exit 1
fi

for cmd in rsvg-convert magick; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "missing: $cmd — run: brew install librsvg imagemagick" >&2
        exit 1
    fi
done

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "rendering PNGs from $SVG"
rsvg-convert -w 16  -h 16  "$SVG" -o "$PUBLIC_DIR/favicon-16x16.png"
rsvg-convert -w 32  -h 32  "$SVG" -o "$PUBLIC_DIR/favicon-32x32.png"
rsvg-convert -w 192 -h 192 "$SVG" -o "$PUBLIC_DIR/logo192.png"
rsvg-convert -w 512 -h 512 "$SVG" -o "$PUBLIC_DIR/logo512.png"

rsvg-convert -w 48 -h 48 "$SVG" -o "$TMP/favicon-48.png"
rsvg-convert -w 64 -h 64 "$SVG" -o "$TMP/favicon-64.png"

echo "bundling multi-resolution favicon.ico"
magick \
    "$PUBLIC_DIR/favicon-16x16.png" \
    "$PUBLIC_DIR/favicon-32x32.png" \
    "$TMP/favicon-48.png" \
    "$TMP/favicon-64.png" \
    "$PUBLIC_DIR/favicon.ico"

echo "done — regenerated:"
ls -la "$PUBLIC_DIR"/favicon.ico "$PUBLIC_DIR"/favicon-*.png "$PUBLIC_DIR"/logo*.png
