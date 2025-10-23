#!/usr/bin/env bash
# Copy custom notification sound to Android native res/raw so Android notifications can reference it by name.
# Usage: ./scripts/install_notification_sound.sh

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ASSET_SRC="$PROJECT_ROOT/assets/sounds/er_notification.mp3"
ANDROID_RAW_DIR="$PROJECT_ROOT/android/app/src/main/res/raw"

if [ ! -f "$ASSET_SRC" ]; then
  echo "ERROR: Source sound not found: $ASSET_SRC"
  exit 2
fi

mkdir -p "$ANDROID_RAW_DIR"

# Android resource names must be lowercase, letters, numbers, and underscores only.
TARGET_NAME="er_notification.mp3"
TARGET_PATH="$ANDROID_RAW_DIR/$TARGET_NAME"

cp "$ASSET_SRC" "$TARGET_PATH"
chmod 644 "$TARGET_PATH"

echo "Copied $ASSET_SRC -> $TARGET_PATH"

echo "Note: After placing the raw resource, rebuild the Android native app (expo run:android or EAS build)."