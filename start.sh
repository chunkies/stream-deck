#!/bin/bash
ELECTRON=/home/tristan/Desktop/Desktop/claud/stream-deck/electron/node_modules/.bin/electron
APP=/home/tristan/Desktop/Desktop/claud/stream-deck/electron

while true; do
  DISPLAY=:1 "$ELECTRON" "$APP" --no-sandbox
  echo "[stream-deck] crashed or exited, restarting in 2s..."
  sleep 2
done
