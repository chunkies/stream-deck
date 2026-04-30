#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ELECTRON="$SCRIPT_DIR/node_modules/.bin/electron"

while true; do
  DISPLAY=:1 "$ELECTRON" "$SCRIPT_DIR" --no-sandbox
  echo "[stream-deck] crashed or exited, restarting in 2s..."
  sleep 2
done
