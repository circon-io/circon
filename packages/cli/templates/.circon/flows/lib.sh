#!/bin/bash
# Shared by the gate flows. Sourced, never run.
#
# Each flow starts the API (so the app renders real data, not its error state),
# drives the app on one surface, reads its accessibility tree and fails on any
# expected label that is missing. The surfaces differ; this part does not.

CLIENT_DIR="apps/mobile"
[ -f ".circon/client-dir" ] && CLIENT_DIR=$(tr -d "[:space:]" < .circon/client-dir)
API_PORT="${API_PORT:-3000}"
METRO_PORT="${METRO_PORT:-8081}"
API_LOG=".circon/api.log"
API_DIR=""
API_PID=""
CHILD_PIDS=""

# Each background job gets its own process group, so stopping it reaches the
# whole tree: `pnpm dev` -> sh -> wrangler -> workerd is four levels deep, and
# killing only the direct child left the API running after the gate.
set -m

# Reap with wait, otherwise bash prints "Terminated" notices into the gate
# output the agent has to read.
stop_pid() {
  [ -n "$1" ] || return 0
  kill -- "-$1" 2> /dev/null || kill "$1" 2> /dev/null
  wait "$1" 2> /dev/null
  return 0
}

stop_all() {
  for pid in $CHILD_PIDS; do stop_pid "$pid"; done
  stop_pid "$API_PID"
  return 0
}

# Wait for an HTTP endpoint, failing fast if the process behind it died.
wait_http() {
  local url="$1" pid="$2" tries="${3:-60}" log="$4"
  for _ in $(seq 1 "$tries"); do
    curl -sf -o /dev/null "$url" 2> /dev/null && return 0
    if [ -n "$pid" ] && ! kill -0 "$pid" 2> /dev/null; then
      echo "Process behind $url died on startup. Last 30 lines:"
      [ -n "$log" ] && tail -n 30 "$log"
      return 1
    fi
    sleep 2
  done
  echo "$url never became reachable."
  [ -n "$log" ] && tail -n 30 "$log"
  return 1
}

start_api() {
  for candidate in services/api services/server; do
    if [ -f "$candidate/package.json" ] && \
       node -e "var p=require(\"./$candidate/package.json\");process.exit(p.scripts&&p.scripts.dev?0:1)" 2>/dev/null; then
      API_DIR="$candidate"
      break
    fi
  done
  [ -n "$API_DIR" ] || return 0

  echo "Starting API from $API_DIR on port $API_PORT..."
  ( cd "$API_DIR" && PORT="$API_PORT" pnpm dev ) > "$API_LOG" 2>&1 &
  API_PID=$!
  # /health, not /: the API has no root route, so probing / got a 404 every
  # time and the gate always waited the full timeout.
  wait_http "http://localhost:$API_PORT/health" "$API_PID" 30 "$API_LOG"
}

# Metro for a native dev build: the app's native shell is built once, and
# every iteration only reloads the JavaScript from here.
start_metro() {
  local api_url="$1" log=".circon/metro.log"
  echo "Starting Metro on port $METRO_PORT..."
  ( cd "$CLIENT_DIR" && EXPO_PUBLIC_API_URL="$api_url" npx expo start --dev-client --port "$METRO_PORT" ) > "$log" 2>&1 &
  CHILD_PIDS="$CHILD_PIDS $!"
  wait_http "http://localhost:$METRO_PORT/status" "$!" 90 "$log"
}

# A cheap stand-in for "did the native project change": rebuilding the native
# shell takes minutes, so it happens only when its inputs moved.
native_fingerprint() {
  cat "$CLIENT_DIR/package.json" "$CLIENT_DIR"/app.config.* "$CLIENT_DIR"/app.json 2> /dev/null | shasum | cut -d' ' -f1
}

# check_labels <snapshot> <expected-file>: prints each label, returns 1 if any is missing.
check_labels() {
  local snapshot="$1" expected="$2" status=0
  echo "--- accessibility tree ---"
  echo "$snapshot"
  echo "--------------------------"
  while IFS= read -r label; do
    case "$label" in ""|\#*) continue ;; esac
    if echo "$snapshot" | grep -qF "$label"; then
      echo "ok      $label"
    else
      echo "MISSING $label   <- not in the accessibility tree"
      status=1
    fi
  done < "$expected"
  return $status
}

# Runtime errors the tree cannot show.
surface_errors() {
  for log in "$@"; do
    [ -f "$log" ] || continue
    if grep -qiE "error|unhandled" "$log"; then
      echo "--- errors in $log ---"
      grep -iE "error|unhandled" "$log" | head -n 15
    fi
  done
  return 0
}
