#!/usr/bin/env bash
# Empaqueta la extensión en dist/ listo para subir a Edge Add-ons o Chrome Web Store.
set -euo pipefail
cd "$(dirname "$0")/.."
version=$(python3 -c "import json;print(json.load(open('extension/manifest.json'))['version'])")
mkdir -p dist
out="dist/lightbox-for-github-${version}.zip"
rm -f "$out"
(cd extension && zip -qr "../$out" .)
echo "Paquete creado: $out"
