#!/bin/bash
# Screenshots of the app's public screens, for the design review and the PR.
#
# Not a gate: it never fails a run. The routes come from the CLI as arguments
# (from .circon/screens.txt, or Expo Router's file routes), and each one is
# saved as $SHOT_DIR/<route>.png, `/` as home.png.

. "$(dirname "$0")/lib.sh"

PORT="${EXPO_WEB_PORT:-8081}"
OUT="${SHOT_DIR:-.circon/screenshots}"
EXPO_LOG=".circon/expo-web.log"

if [ ! -d "$CLIENT_DIR" ]; then
  echo "No client at $CLIENT_DIR - no screens to capture."
  exit 0
fi
if [ "$#" -eq 0 ]; then
  echo "No routes given - nothing to capture."
  exit 0
fi
mkdir -p "$OUT"

cleanup() {
  agent-device close > /dev/null 2>&1
  stop_all
}
trap cleanup EXIT

# Real data, not the app's error state, is what a reviewer should see.
start_api || exit 0

( cd "$CLIENT_DIR" && EXPO_PUBLIC_API_URL="http://localhost:$API_PORT" npx expo start --web --port "$PORT" ) > "$EXPO_LOG" 2>&1 &
CHILD_PIDS="$!"
wait_http "http://localhost:$PORT" "$CHILD_PIDS" 60 "$EXPO_LOG" || exit 0

for route in "$@"; do
  name=$(printf '%s' "$route" | sed -e 's#^/*##' -e 's#/\{1,\}#-#g')
  [ -n "$name" ] || name="home"
  if agent-device open "http://localhost:$PORT$route" --platform web > /dev/null 2>&1 \
    && agent-device screenshot "$OUT/$name.png" > /dev/null 2>&1; then
    echo "captured $route"
  else
    echo "could not capture $route"
  fi
done
exit 0
