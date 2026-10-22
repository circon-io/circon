#!/bin/bash
# Loop 2 - Android UI gate, against the real React Native runtime.
#
# The gate boots the circon_pixel emulator when this flow needs a device. The
# debug app is built and installed only when its native inputs change (that
# takes minutes); every other iteration just reloads JavaScript from Metro.
#
# Inert until both files exist:
#   .circon/android-app-id         the application id (the scaffold writes it)
#   .circon/expected-android.txt   labels the running app must expose

. "$(dirname "$0")/lib.sh"

APP_ID_FILE=".circon/android-app-id"
EXPECTED=".circon/expected-android.txt"
BUILD_LOG=".circon/android-build.log"
STAMP=".circon/android-native.fingerprint"

if [ ! -f "$APP_ID_FILE" ] || [ ! -f "$EXPECTED" ]; then
  echo "Android gate not configured (need $APP_ID_FILE and $EXPECTED), skipping."
  exit 0
fi
APP_ID=$(tr -d "[:space:]" < "$APP_ID_FILE")
[ -n "$APP_ID" ] || { echo "Empty $APP_ID_FILE, skipping."; exit 0; }

SERIAL=$(adb devices | awk '$2 == "device" { print $1; exit }')
[ -n "$SERIAL" ] || { echo "No Android device attached."; exit 1; }

cleanup() {
  agent-device close > /dev/null 2>&1
  stop_all
}
trap cleanup EXIT

start_api || exit 1
# The device reaches the runner's API and Metro as its own localhost.
adb -s "$SERIAL" reverse "tcp:$API_PORT" "tcp:$API_PORT" > /dev/null
adb -s "$SERIAL" reverse "tcp:$METRO_PORT" "tcp:$METRO_PORT" > /dev/null

FINGERPRINT=$(native_fingerprint)
INSTALLED=$(adb -s "$SERIAL" shell pm list packages "$APP_ID" | tr -d '\r' | grep -cx "package:$APP_ID" || true)
if [ "$INSTALLED" = "0" ] || [ "$(cat "$STAMP" 2> /dev/null)" != "$FINGERPRINT" ]; then
  echo "Building and installing the debug app (native inputs changed)..."
  if ! ( cd "$CLIENT_DIR" && npx expo run:android --no-bundler --device "$SERIAL" ) > "$BUILD_LOG" 2>&1; then
    echo "The Android build failed. Last 40 lines:"
    tail -n 40 "$BUILD_LOG"
    exit 1
  fi
  echo "$FINGERPRINT" > "$STAMP"
fi

start_metro "http://localhost:$API_PORT" || exit 1

if ! agent-device open "$APP_ID" --platform android --serial "$SERIAL"; then
  echo "agent-device could not open $APP_ID on $SERIAL."
  exit 1
fi
# The dev build fetches its bundle from Metro on launch; give it time to render.
sleep 8

SNAPSHOT=$(agent-device snapshot -i 2>&1)
[ -n "$SNAPSHOT" ] || { echo "Empty accessibility snapshot from the device."; exit 1; }

check_labels "$SNAPSHOT" "$EXPECTED"
STATUS=$?
surface_errors ".circon/metro.log" "$API_LOG"
exit $STATUS
