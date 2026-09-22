#!/usr/bin/env bash
# Package a Chrome Web Store upload from dist/chrome/.
set -euo pipefail

version=$(python3 -c "import json; print(json.load(open('manifests/manifest.chrome.json'))['version'])")
mkdir -p web-ext-artifacts
out="web-ext-artifacts/fzf-browser-tabs-chrome-${version}.zip"
rm -f "$out"
(cd dist/chrome && zip -qr "../../$out" manifest.json background.js content.js)
echo "packaged $out"
