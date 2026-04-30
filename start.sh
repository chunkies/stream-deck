#!/bin/bash
# Headless keep-alive launcher for MacroPad (Linux with virtual display).
# Requires: Xvfb running on :1, and the app built + packaged (AppImage or deb).
# For dev: use `npm run dev` instead.

APPIMAGE="$(dirname "$0")/releases/macropad-linux.AppImage"

if [ ! -f "$APPIMAGE" ]; then
  echo "[macropad] AppImage not found at $APPIMAGE — run npm run package:linux first"
  exit 1
fi

while true; do
  DISPLAY=:1 "$APPIMAGE" --no-sandbox
  echo "[macropad] exited or crashed, restarting in 2s..."
  sleep 2
done
