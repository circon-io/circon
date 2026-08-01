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

# Run from the monorepo root. The client lives in a workspace package; override
# with .circon/client-dir if yours is not at apps/mobile.
CLIENT_DIR="apps/mobile"
[ -f ".circon/client-dir" ] && CLIENT_DIR=$(tr -d "[:space:]" < .circon/client-dir)

PORT="${EXPO_WEB_PORT:-8081}"
API_PORT="${API_PORT:-3000}"
EXPECTED=".circon/expected-web.txt"
EXPO_LOG=".circon/expo-web.log"
API_LOG=".circon/api.log"

if [ ! -f "$EXPECTED" ]; then
  echo "No $EXPECTED - nothing to assert yet, skipping web gate."
  exit 0
fi

if [ ! -d "$CLIENT_DIR" ]; then
  echo "No client at $CLIENT_DIR - skipping web gate."
  echo "Set a different path in .circon/client-dir if the client lives elsewhere."
  exit 0
fi

EXPO_PID=""
API_PID=""
# Reap with wait, otherwise bash prints "Terminated" notices into the gate
# output the agent has to read
stop() {
  [ -n "$1" ] || return 0
  pkill -P "$1" 2> /dev/null
  kill "$1" 2> /dev/null
  wait "$1" 2> /dev/null
  return 0
}
cleanup() {
  agent-device close > /dev/null 2>&1
  stop "$EXPO_PID"
  stop "$API_PID"
  return 0
}
trap cleanup EXIT

# Start the backend first if there is one, otherwise the client renders its
# error state and the accessibility tree is a lie about what was built.
API_DIR=""
for candidate in services/api services/server; do
  if [ -f "$candidate/package.json" ] && \
     node -e "var p=require(\"./$candidate/package.json\");process.exit(p.scripts&&p.scripts.dev?0:1)" 2>/dev/null; then
    API_DIR="$candidate"
    break
  fi
done

if [ -n "$API_DIR" ]; then
  echo "Starting API from $API_DIR on port $API_PORT..."
  ( cd "$API_DIR" && PORT="$API_PORT" pnpm dev ) > "$API_LOG" 2>&1 &
  API_PID=$!

  for _ in $(seq 1 30); do
    curl -sf -o /dev/null "http://localhost:$API_PORT" 2>/dev/null && break
    kill -0 "$API_PID" 2> /dev/null || break
    sleep 1
  done

  if ! kill -0 "$API_PID" 2> /dev/null; then
    echo "API died on startup. Last 30 lines:"
    tail -n 30 "$API_LOG"
    exit 1
  fi
fi

echo "Starting Expo web from $CLIENT_DIR on port $PORT..."
( cd "$CLIENT_DIR" && npx expo start --web --port "$PORT" ) > "$EXPO_LOG" 2>&1 &
EXPO_PID=$!

# Wait for the dev server, but not forever
READY=""
for _ in $(seq 1 60); do
  if curl -sf "http://localhost:$PORT" > /dev/null 2>&1; then READY=1; break; fi
  if ! kill -0 "$EXPO_PID" 2> /dev/null; then
    echo "Expo web server died on startup. Last 30 lines:"
    tail -n 30 "$EXPO_LOG"
    exit 1
  fi
  sleep 2
done

if [ -z "$READY" ]; then
  echo "Expo web server never became reachable on port $PORT. Last 30 lines:"
  tail -n 30 "$EXPO_LOG"
  exit 1
fi

if ! agent-device open "http://localhost:$PORT" --platform web; then
  echo "agent-device could not open the web target."
  exit 1
fi

SNAPSHOT=$(agent-device snapshot -i 2>&1)
if [ -z "$SNAPSHOT" ]; then
  echo "Empty accessibility snapshot - the app rendered nothing addressable."
  exit 1
fi

echo "--- accessibility tree ---"
echo "$SNAPSHOT"
echo "--------------------------"

STATUS=0
while IFS= read -r label; do
  case "$label" in ""|\#*) continue ;; esac
  if echo "$SNAPSHOT" | grep -qF "$label"; then
    echo "ok      $label"
  else
    echo "MISSING $label   <- not in the accessibility tree"
    STATUS=1
  fi
done < "$EXPECTED"

# Surface runtime errors the tree cannot show
if grep -qiE "error|unhandled" "$EXPO_LOG"; then
  echo "--- errors in the Expo log ---"
  grep -iE "error|unhandled" "$EXPO_LOG" | head -n 15
  echo "------------------------------"
fi

if [ -n "$API_DIR" ] && grep -qiE "error|unhandled" "$API_LOG"; then
  echo "--- errors in the API log ---"
  grep -iE "error|unhandled" "$API_LOG" | head -n 15
  echo "-----------------------------"
fi

exit $STATUS
