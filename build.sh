#!/usr/bin/env bash
set -euo pipefail

VERSION=$(grep '"version"' manifest.chrome.json | head -1 | sed 's/.*: *"\(.*\)".*/\1/')
DIST_DIR="dist"

SOURCES=(
  background.js
  click.js
  color.js
  fonts.css
  fonts
  icons
  interstitial.html
  interstitial.js
  options.html
  options.js
  settings.js
  validation.js
  waveform.js
  welcome.html
  welcome.js
  words.js
)

build_zip() {
  local manifest="$1" zip_path="$2"
  local tmpdir
  tmpdir=$(mktemp -d)
  cp -r "${SOURCES[@]}" "$tmpdir/"
  cp "$manifest" "$tmpdir/manifest.json"
  (cd "$tmpdir" && zip -r -q - .) > "$zip_path"
  rm -rf "$tmpdir"
}

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

echo "Building Blank v${VERSION}..."

build_zip manifest.chrome.json "$DIST_DIR/blank-${VERSION}-chrome.zip"
echo "  Chrome: $DIST_DIR/blank-${VERSION}-chrome.zip"

build_zip manifest.firefox.json "$DIST_DIR/blank-${VERSION}-firefox.zip"
echo "  Firefox: $DIST_DIR/blank-${VERSION}-firefox.zip"

echo "Done."
