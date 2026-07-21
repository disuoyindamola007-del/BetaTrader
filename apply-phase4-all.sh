#!/bin/bash
set -e

ZIP="phase4-all.zip"
EXTRACT_DIR="phase4-all"
BACKUP_DIR="_backup-before-phase4"

echo "== Phase 4: NaN guard, chart leak fixes, real favorites/share/retry, real profile settings & stats =="

if [ ! -f "$ZIP" ]; then
  echo "ERROR: $ZIP not found in current directory."
  exit 1
fi

mkdir -p "$BACKUP_DIR"
rm -rf "$EXTRACT_DIR"
unzip -o "$ZIP" -d "$EXTRACT_DIR" > /dev/null

MODIFIED_FILES=(
  "index.html"
  "src/index.css"
  "src/AppContext.jsx"
  "src/data/mockData.js"
  "src/hooks/useMarketData.js"
  "src/components/shared/PriceChange.jsx"
  "src/components/home/HomeScreen.jsx"
  "src/components/markets/AssetDetail.jsx"
  "src/components/profile/ProfileScreen.jsx"
)

echo "-- Backing up existing files to $BACKUP_DIR --"
for f in "${MODIFIED_FILES[@]}"; do
  if [ -f "$f" ]; then
    mkdir -p "$BACKUP_DIR/$(dirname "$f")"
    cp "$f" "$BACKUP_DIR/$f"
    echo "  backed up: $f"
  fi
done

echo "-- Copying modified files --"
for f in "${MODIFIED_FILES[@]}"; do
  mkdir -p "$(dirname "$f")"
  cp "$EXTRACT_DIR/$f" "$f"
  echo "  updated: $f"
done

echo "-- Adding new files --"
mkdir -p src/services
cp "$EXTRACT_DIR/src/services/favoritesService.js" src/services/favoritesService.js
cp "$EXTRACT_DIR/src/services/settingsService.js" src/services/settingsService.js
echo "  added: src/services/favoritesService.js"
echo "  added: src/services/settingsService.js"

echo "-- Removing confirmed-dead file --"
if [ -f src/providers/MarketDataProvider.jsx ]; then
  mkdir -p "$BACKUP_DIR/src/providers"
  cp src/providers/MarketDataProvider.jsx "$BACKUP_DIR/src/providers/MarketDataProvider.jsx"
  rm src/providers/MarketDataProvider.jsx
  echo "  removed (backed up first): src/providers/MarketDataProvider.jsx"
else
  echo "  src/providers/MarketDataProvider.jsx already absent, skipping"
fi

echo ""
echo "-- Verification --"
grep -q "Number.isNaN(pct)" src/components/shared/PriceChange.jsx && echo "  OK: PriceChange NaN guard present" || echo "  WARN: NaN guard not found"
grep -q "homeChartObserver" src/components/home/HomeScreen.jsx && echo "  OK: HomeScreen ResizeObserver leak fix present" || echo "  WARN: HomeScreen fix not found"
grep -q "chartObserverRef" src/components/markets/AssetDetail.jsx && echo "  OK: AssetDetail ResizeObserver leak fix present" || echo "  WARN: AssetDetail leak fix not found"
grep -q "toggleFavorite" src/components/markets/AssetDetail.jsx && echo "  OK: Favorite button wired" || echo "  WARN: Favorite button not wired"
grep -q "handleShare" src/components/markets/AssetDetail.jsx && echo "  OK: Share button wired" || echo "  WARN: Share button not wired"
grep -q "handleRetry" src/components/markets/AssetDetail.jsx && echo "  OK: Retry button wired" || echo "  WARN: Retry button not wired"
grep -q "safe-area-pb" src/index.css && echo "  OK: safe-area-pb class defined" || echo "  WARN: safe-area-pb still missing"
grep -q "viewport-fit=cover" index.html && echo "  OK: viewport-fit=cover added" || echo "  WARN: viewport-fit missing"
grep -qv "user-scalable=no" index.html && echo "  OK: pinch-zoom re-enabled" || true
grep -q "getTrades" src/components/profile/ProfileScreen.jsx && echo "  OK: Profile stats wired to real data" || echo "  WARN: Profile stats not wired"
grep -q "showComingSoon" src/components/profile/ProfileScreen.jsx && echo "  OK: Profile dead buttons now give real feedback" || echo "  WARN: Profile feedback not added"
grep -q "assetDetails" src/data/mockData.js && echo "  WARN: dead assetDetails export still present" || echo "  OK: dead assetDetails export removed"
[ -f src/providers/MarketDataProvider.jsx ] && echo "  WARN: MarketDataProvider.jsx still present" || echo "  OK: MarketDataProvider.jsx removed"

echo ""
echo "-- Cleanup --"
rm -rf "$EXTRACT_DIR"
echo "Done. Backups saved in $BACKUP_DIR/ (safe to delete once you've confirmed the build works)."
echo ""
echo "Next steps:"
echo "  npm run build"
echo "  git add -A"
echo "  git commit -m 'Phase 4: NaN guard, chart memory leak fixes, real favorites/share/retry, real profile settings & stats, cleanup'"
echo "  git pull"
echo "  git push"
