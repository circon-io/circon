#!/bin/bash
# Loop 2 - Android native UI gate.
#
# Same contract as web.sh, against the real React Native runtime on the
# emulator. Inert until you record the installed app id, because installing a
# dev build is far slower than the web loop and is not worth doing every
# iteration:
#
#   echo com.yourorg.yourapp > .circon/android-app-id

APP_ID_FILE=".circon/android-app-id"
EXPECTED=".circon/expected-android.txt"

if [ ! -f "$APP_ID_FILE" ] || [ ! -f "$EXPECTED" ]; then
  echo "Android gate not configured (need $APP_ID_FILE and $EXPECTED), skipping."
  exit 0
fi

APP_ID=$(tr -d "[:space:]" < "$APP_ID_FILE")
[ -n "$APP_ID" ] || { echo "Empty $APP_ID_FILE, skipping."; exit 0; }

cleanup() { agent-device close > /dev/null 2>&1; return 0; }
trap cleanup EXIT

if ! agent-device open "$APP_ID" --platform android; then
  echo "agent-device could not open $APP_ID on the emulator."
  echo "Is the dev build installed?  adb shell pm list packages | grep ${APP_ID%%.*}"
  exit 1
fi

SNAPSHOT=$(agent-device snapshot -i 2>&1)
if [ -z "$SNAPSHOT" ]; then
  echo "Empty accessibility snapshot from the emulator."
  exit 1
fi

echo "--- accessibility tree (android) ---"
echo "$SNAPSHOT"
echo "------------------------------------"

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

exit $STATUS
