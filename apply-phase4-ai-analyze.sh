#!/usr/bin/env bash
set -euo pipefail

# Phase 4 — real AI Analysis via Groq, replacing the static if/else text
# and the dead "Analyze" button on Asset Detail.
#
# Run from your repo root: ~/BetaTrader

REPO_ROOT="$(pwd)"
ZIP_NAME="phase4-ai-analyze.zip"
BACKUP_DIR="_backup-before-phase4-$(date +%Y%m%d-%H%M%S)"

if [ ! -f "$ZIP_NAME" ]; then
  echo "Error: $ZIP_NAME not found in $REPO_ROOT"
  echo "Copy it here first, e.g.: cp ~/storage/shared/BetaTrader/$ZIP_NAME ."
  exit 1
fi

echo "Backing up files this patch will touch to $BACKUP_DIR ..."
mkdir -p "$BACKUP_DIR/src/components/markets"
mkdir -p "$BACKUP_DIR/api/analyze"

# Back up the one existing file we're overwriting (api/analyze/[symbol].js is new, nothing to back up there)
if [ -f "src/components/markets/AssetDetail.jsx" ]; then
  cp "src/components/markets/AssetDetail.jsx" "$BACKUP_DIR/src/components/markets/AssetDetail.jsx"
fi

echo "Extracting $ZIP_NAME ..."
unzip -o "$ZIP_NAME" -d .

echo ""
echo "Done. Backup of previous AssetDetail.jsx saved to $BACKUP_DIR/"
echo ""
echo "IMPORTANT — before this works in production:"
echo "  1. In Vercel dashboard, add env var GROQ_API_KEY (no VITE_ prefix) with your Groq key."
echo "     Do NOT rely on the existing VITE_GROQ_API_KEY var — that one is client-exposed"
echo "     and is not read by the new server-side route."
echo "  2. Redeploy so the new env var and api/analyze route are live."
echo "  3. Manually test: open an asset with enough candle history, tap Analyze,"
echo "     confirm a real (non-repeating, asset-specific) response appears."
echo "  4. Test the disabled state: an asset with insufficient history should show"
echo "     the Analyze button disabled and the box should say so, not crash."
echo ""
echo "This sandbox has no internet access, so none of this was build- or runtime-tested."
echo "You are responsible for verifying it works before considering Phase 4 complete."
