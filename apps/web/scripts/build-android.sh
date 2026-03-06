#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_DIR="$(dirname "$SCRIPT_DIR")"
cd "$WEB_DIR"

API_URL="${NEXT_PUBLIC_API_URL:-https://operator-os.replit.app}"

echo "============================================"
echo "  OperatorOS Android Build"
echo "  API URL: $API_URL"
echo "============================================"
echo ""

echo "[1/4] Building Next.js static export..."
MOBILE_BUILD=1 NEXT_PUBLIC_API_URL="$API_URL" npx next build
echo "  Static files generated in out/"
echo ""

echo "[2/4] Injecting mobile API configuration..."
cat > out/capacitor-config.js << EOF
window.__CAPACITOR_API_URL__ = "${API_URL}";
EOF

for HTML_FILE in out/*.html; do
  if [ -f "$HTML_FILE" ]; then
    sed -i 's|</head>|<script src="/capacitor-config.js"></script></head>|' "$HTML_FILE"
  fi
done
echo "  API URL injected into all HTML pages"
echo ""

echo "[3/4] Syncing Capacitor..."
npx cap sync android
echo "  Capacitor sync complete"
echo ""

echo "[4/4] Build complete!"
echo ""
echo "============================================"
echo "  Next steps:"
echo "============================================"
echo ""
echo "  Option A: Build debug APK (no Android Studio needed):"
echo "    cd android && ./gradlew assembleDebug"
echo "    APK: android/app/build/outputs/apk/debug/app-debug.apk"
echo ""
echo "  Option B: Build release AAB for Play Store:"
echo "    cd android && ./gradlew bundleRelease"
echo "    AAB: android/app/build/outputs/bundle/release/app-release.aab"
echo "    (Requires signing key — see PLAY_STORE_GUIDE.md)"
echo ""
echo "  Option C: Open in Android Studio:"
echo "    npx cap open android"
echo ""
