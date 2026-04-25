#!/usr/bin/env bash
# Check that vendored Vyper contracts (PaymentSplitter.vy, Vault.vy) match
# the pinned upstream commit. Fails CI if drift is detected.
#
# Usage:
#   bash scripts/check-contract-drift.sh                      # check pinned
#   bash scripts/check-contract-drift.sh --pin <commit-sha>   # check vs different pin
set -euo pipefail

REPO="vyperlang/vyper-agentic-payments"
DEFAULT_PIN="c5f599d25aa8a2bb330682cd23e7dfd28a50d1e8"
TARGET_DIR="$(cd "$(dirname "$0")/.." && pwd)/contracts/arc"
FILES=(PaymentSplitter.vy Vault.vy)

PIN="$DEFAULT_PIN"
if [[ ${1:-} == "--pin" && -n ${2:-} ]]; then
  PIN="$2"
fi

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

echo "[check-contract-drift] checking $REPO @ $PIN"
EXIT=0

for f in "${FILES[@]}"; do
  url="https://raw.githubusercontent.com/${REPO}/${PIN}/contracts/${f}"
  curl -fsSL "$url" -o "$TMPDIR/$f"

  # Compare ignoring our 4-line provenance header (CONTRACT_SOURCE / CONTRACT_SYNCED_AT / License / DO NOT EDIT + blank line)
  if ! diff -q \
      <(tail -n +6 "$TARGET_DIR/$f") \
      "$TMPDIR/$f" >/dev/null 2>&1; then
    echo "[drift] $f differs from pinned upstream"
    diff <(tail -n +6 "$TARGET_DIR/$f") "$TMPDIR/$f" || true
    EXIT=1
  else
    echo "[ok]    $f matches pinned upstream"
  fi
done

exit $EXIT
