#!/bin/bash
set -euo pipefail

# Run this from the root of your BetaTrader repo, after unzipping
# phase1-critical-fixes.zip into a folder called "phase1-critical-fixes".

SRC="phase1-critical-fixes"

if [ ! -d "$SRC" ]; then
  echo "Error: '$SRC' folder not found. Unzip phase1-critical-fixes.zip here first."
  exit 1
fi

mkdir -p "_backup-before-phase1-fix"
cp src/services/marketDataService.js "_backup-before-phase1-fix/marketDataService.js.bak"
cp "api/stocks/[symbol].js" "_backup-before-phase1-fix/stocks-symbol.js.bak"
cp "api/crypto/[symbol].js" "_backup-before-phase1-fix/crypto-symbol.js.bak"

cp "$SRC/marketDataService.js" src/services/marketDataService.js
cp "$SRC/api-stocks/[symbol].js" "api/stocks/[symbol].js"
cp "$SRC/api-crypto/[symbol].js" "api/crypto/[symbol].js"

echo ""
echo "Applied. Verifying the 3 fixes landed:"
grep -q "Guard: not enough candles" src/services/marketDataService.js && echo "  OK  calcRSI guard" || echo "  MISSING  calcRSI guard"
grep -q "finnhubRateLimited" "api/stocks/[symbol].js" && echo "  OK  stocks rate-limit fallback fix" || echo "  MISSING  stocks fix"
grep -q "Unexpected CoinGecko OHLC response shape" "api/crypto/[symbol].js" && echo "  OK  crypto response validation" || echo "  MISSING  crypto fix"

echo ""
echo "Now: git status / git add -A / git commit"
