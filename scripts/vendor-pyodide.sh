#!/usr/bin/env bash
# scripts/vendor-pyodide.sh
# ---------------------------------------------------------------------------
# Downloads the Pyodide runtime into vendor/pyodide/ so the FunPay Cardinal
# plugin engine works fully offline and without relaxing the extension CSP.
#
# Manifest V3 forbids loading the runtime from a CDN inside extension pages,
# therefore the Python engine prefers a locally vendored copy. Run this once
# before packaging/publishing the extension.
# ---------------------------------------------------------------------------
set -euo pipefail

VERSION="${1:-v0.26.4}"
BASE="https://cdn.jsdelivr.net/pyodide/${VERSION}/full"
DEST="$(cd "$(dirname "$0")/.." && pwd)/vendor/pyodide"

mkdir -p "$DEST"

FILES=(
  pyodide.js
  pyodide.asm.js
  pyodide.asm.wasm
  python_stdlib.zip
  pyodide-lock.json
)

echo "Downloading Pyodide ${VERSION} -> ${DEST}"
for f in "${FILES[@]}"; do
  echo "  - ${f}"
  curl -fL --retry 3 -o "${DEST}/${f}" "${BASE}/${f}"
done

echo "Done. Pyodide vendored (offline plugin engine enabled)."
