#!/usr/bin/env bash
# package.sh — builds a Chrome Web Store zip from the extension source
# Usage: ./package.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION=$(python3 -c "import json; print(json.load(open('$SCRIPT_DIR/manifest.json'))['version'])")
OUT="$SCRIPT_DIR/../download-bell-$VERSION.zip"

echo "Packaging Download Bell v$VERSION..."

cd "$SCRIPT_DIR"

zip -r "$OUT" . \
  --exclude "*.git*" \
  --exclude "*.DS_Store" \
  --exclude "*/node_modules/*" \
  --exclude "*/tests/*" \
  --exclude "*/GoogleStoreAssets/*" \
  --exclude "package*.json" \
  --exclude "README.md" \
  --exclude "PRIVACY.md" \
  --exclude "*.sh"

echo "Created: $OUT"
