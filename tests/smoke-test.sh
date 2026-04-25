#!/usr/bin/env bash
# pay2play smoke test — starts C1 api-meter and verifies 402 gate + info endpoint.
# Usage: bash tests/smoke-test.sh
# Requires: .env with SELLER_ADDRESS set

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TSX="$ROOT/node_modules/.bin/tsx"

# Load .env
if [[ -f "$ROOT/.env" ]]; then
  set -a; source "$ROOT/.env"; set +a
fi

if [[ -z "${SELLER_ADDRESS:-}" ]]; then
  echo "ERROR: SELLER_ADDRESS not set. Run: pnpm tsx scripts/generate-wallets.ts"
  exit 1
fi

echo "=== pay2play smoke test ==="
echo "Seller : $SELLER_ADDRESS"
echo "Buyer  : ${BUYER_ADDRESS:-<not set>}"
echo ""

# Start C1 server in background
SELLER_ADDRESS="$SELLER_ADDRESS" "$TSX" "$ROOT/components/c1-api-meter/src/server.ts" &
SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null; echo 'server stopped'" EXIT

# Wait for server
sleep 3

PORT="${C1_PORT:-4021}"
BASE="http://localhost:$PORT"

echo "--- GET / (info, free) ---"
INFO=$(curl -sf "$BASE/")
echo "$INFO" | python3 -m json.tool 2>/dev/null || echo "$INFO"
echo ""

echo "--- GET /weather (paid → expect 402) ---"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/weather")
if [[ "$STATUS" == "402" ]]; then
  echo "PASS  HTTP $STATUS (payment required)"
else
  echo "FAIL  HTTP $STATUS (expected 402)"
  exit 1
fi
echo ""

echo "--- PAYMENT-REQUIRED header content ---"
curl -si "$BASE/weather" 2>&1 | grep -i "payment-required" | head -3 || echo "(no PAYMENT-REQUIRED header)"
echo ""

echo "--- GET /stats (free) ---"
STATS=$(curl -sf "$BASE/stats")
echo "$STATS" | python3 -m json.tool 2>/dev/null || echo "$STATS"
echo ""

echo "=== ALL CHECKS PASSED ==="
echo "Wallet pair:"
echo "  Seller: $SELLER_ADDRESS"
echo "  Buyer : ${BUYER_ADDRESS:-<not set>}"
echo ""
echo "Next: fund buyer at https://faucet.circle.com → Arc Testnet → 20 USDC"
echo "      then run: pnpm tsx scripts/fund.ts to deposit into Gateway"
