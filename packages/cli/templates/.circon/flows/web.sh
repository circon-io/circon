#!/bin/bash
# Loop 1 - web UI gate.
#
# Boots the Expo web build, reads the accessibility tree via agent-device, and
# fails if any label listed in .circon/expected-web.txt is missing from it.
#
# This is what enforces the testID/accessibilityLabel contract: an element
# without them never appears in the tree, so the gate catches it at runtime -
# a stronger check than any lint rule, because it proves the label actually
# reaches the accessibility layer.

. "$(dirname "$0")/lib.sh"

PORT="${EXPO_WEB_PORT:-8081}"
EXPECTED=".circon/expected-web.txt"
EXPO_LOG=".circon/expo-web.log"

if [ ! -f "$EXPECTED" ]; then
  echo "No $EXPECTED - nothing to assert yet, skipping web gate."
  exit 0
fi
if [ ! -d "$CLIENT_DIR" ]; then
  echo "No client at $CLIENT_DIR - skipping web gate."
  echo "Set a different path in .circon/client-dir if the client lives elsewhere."
  exit 0
fi

cleanup() {
  agent-device close > /dev/null 2>&1
  stop_all
}
trap cleanup EXIT

start_api || exit 1

echo "Starting Expo web from $CLIENT_DIR on port $PORT..."
# The app must talk to the API started above, not whatever .env points at.
( cd "$CLIENT_DIR" && EXPO_PUBLIC_API_URL="http://localhost:$API_PORT" npx expo start --web --port "$PORT" ) > "$EXPO_LOG" 2>&1 &
CHILD_PIDS="$!"
wait_http "http://localhost:$PORT" "$CHILD_PIDS" 60 "$EXPO_LOG" || exit 1

if ! agent-device open "http://localhost:$PORT" --platform web; then
  echo "agent-device could not open the web target."
  exit 1
fi

SNAPSHOT=$(agent-device snapshot -i 2>&1)
if [ -z "$SNAPSHOT" ]; then
  echo "Empty accessibility snapshot - the app rendered nothing addressable."
  exit 1
fi

check_labels "$SNAPSHOT" "$EXPECTED"
STATUS=$?
surface_errors "$EXPO_LOG" "$API_LOG"
exit $STATUS
