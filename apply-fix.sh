#!/bin/bash
set -euo pipefail

# Run this from the root of your BetaTrader repo.
SRC="market-data-fix"   # folder created by unzipping market-data-fix.zip

if [ ! -d "$SRC" ]; then
  echo "Error: '$SRC' folder not found. Unzip market-data-fix.zip here first."
  exit 1
fi

# Copy each top-level folder from the fix into the repo, creating
# destination directories as needed (-p on mkdir, cp -r preserves the rest).
for dir in api lib src; do
  if [ -d "$SRC/$dir" ]; then
    mkdir -p "$dir"
    cp -rv "$SRC/$dir/." "$dir/"
  fi
done

echo ""
echo "Done. Verifying the 3 previously-missing files landed:"
for f in src/hooks/useMarketData.js src/services/marketDataService.js src/providers/MarketDataProvider.jsx; do
  if [ -f "$f" ]; then
    echo "  OK  $f"
  else
    echo "  MISSING  $f"
  fi
done

echo ""
echo "Now: git status / git add -A / git commit"
