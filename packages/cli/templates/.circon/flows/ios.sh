#!/bin/bash
# Loop 3 - iOS UI gate. The gate passes the runner's iosRunnerMode:
#
#   simulator  macOS runner: an iOS simulator, driven by agent-device
#   device     a real iPhone on USB
#              - macOS runner: built with Xcode, driven by agent-device
#              - Linux runner: the unsigned dev-client IPA from Codemagic
#                (workflow dev-client) and Appium's WebDriverAgent, both signed
#                for this phone and installed by xtool; go-ios runs
#                WebDriverAgent, which opens the app against this machine's
#                Metro and reads the hierarchy
#
# Why not the simulator on Linux: see CLAUDE.md in the circon repository. The
# simulator is macOS-only, and no VM route works.
#
# Inert until .circon/expected-ios.txt lists labels. The bundle id comes from
# .circon/ios-app-id, or the same id as Android.

. "$(dirname "$0")/lib.sh"

MODE="${1:-none}"
EXPECTED=".circon/expected-ios.txt"
BUILD_LOG=".circon/ios-build.log"
STAMP=".circon/ios-native.fingerprint"

[ -f "$EXPECTED" ] || { echo "No $EXPECTED - nothing to assert yet, skipping iOS gate."; exit 0; }
APP_ID=$(tr -d "[:space:]" < ".circon/ios-app-id" 2> /dev/null || tr -d "[:space:]" < ".circon/android-app-id" 2> /dev/null)
[ -n "$APP_ID" ] || { echo "No bundle id in .circon/ios-app-id or .circon/android-app-id."; exit 1; }
SCHEME=$(node -e "const c=require('fs').readFileSync('$CLIENT_DIR/app.config.ts','utf8');const m=/scheme:\s*'([^']+)'/.exec(c);console.log(m?m[1]:'')" 2> /dev/null)

cleanup() {
  agent-device close > /dev/null 2>&1
  stop_all
}
trap cleanup EXIT

lan_ip() {
  if [ "$(uname -s)" = "Darwin" ]; then ipconfig getifaddr en0; else hostname -I | awk '{ print $1 }'; fi
}

# Build and install the dev client when its native inputs changed.
build_on_mac() {
  local target="$1"
  local fingerprint
  fingerprint="$(native_fingerprint)-$target"
  [ "$(cat "$STAMP" 2> /dev/null)" = "$fingerprint" ] && return 0
  echo "Building the iOS dev client (native inputs changed)..."
  if ! ( cd "$CLIENT_DIR" && npx expo run:ios --no-bundler --device "$target" ) > "$BUILD_LOG" 2>&1; then
    echo "The iOS build failed. Last 40 lines:"
    tail -n 40 "$BUILD_LOG"
    return 1
  fi
  echo "$fingerprint" > "$STAMP"
}

# xtool signs under its own bundle id, XTL-<team>.<original id>, so an app it
# installed is found on the phone by that pattern, never assumed.
installed_id() {
  local pattern
  pattern="XTL-[A-Za-z0-9]+\\.$(printf '%s' "$1" | sed 's/\./\\./g')"
  # The id must end there: com.acme.shop is not com.acme.shopx.
  ios apps --list --udid="$UDID" 2> /dev/null | grep -oE "$pattern([^A-Za-z0-9._-]|\$)" | grep -oE "$pattern" | head -n 1
}

# Install with xtool unless this exact build is already on this phone. The
# stamp names the build and the phone; the phone is asked as well, since a
# reset or a deleted app leaves the stamp behind.
xtool_install() {
  local path="$1" identity="$2" stamp="$3" bundle="$4" what="$5"
  if [ "$(cat "$stamp" 2> /dev/null)" = "$identity" ] && [ -n "$(installed_id "$bundle")" ]; then
    return 0
  fi
  echo "Installing $what on the iPhone (xtool signs it for this device)..."
  "$XTOOL" install --udid "$UDID" "$path" > "$BUILD_LOG" 2>&1 || {
    echo "xtool could not install $what:"
    tail -n 20 "$BUILD_LOG"
    return 1
  }
  echo "$identity" > "$stamp"
}

snapshot_with_agent_device() {
  local udid="$1"
  agent-device open "$APP_ID" --platform ios --udid "$udid" || { echo "agent-device could not open $APP_ID."; return 1; }
  sleep 8
  agent-device snapshot -i --udid "$udid" 2>&1
}

case "$MODE" in
  simulator)
    [ "$(uname -s)" = "Darwin" ] || { echo "iosRunnerMode=simulator needs a macOS runner."; exit 1; }
    # The booted iPhone simulator, or the first available one booted now.
    UDID=$(xcrun simctl list devices booted -j | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const d=Object.values(JSON.parse(s).devices).flat().find(x=>/iPhone/.test(x.name));console.log(d?d.udid:'')})")
    if [ -z "$UDID" ]; then
      UDID=$(xcrun simctl list devices available -j | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const d=Object.values(JSON.parse(s).devices).flat().find(x=>/iPhone/.test(x.name));console.log(d?d.udid:'')})")
      [ -n "$UDID" ] || { echo "No iPhone simulator available — run 'circon setup --only ios-simulator'."; exit 1; }
      xcrun simctl boot "$UDID"
      xcrun simctl bootstatus "$UDID" > /dev/null
    fi
    start_api || exit 1
    build_on_mac "$UDID" || exit 1
    start_metro "http://localhost:$API_PORT" || exit 1
    # Point the dev client at this Metro rather than leaving it on its launcher.
    [ -n "$SCHEME" ] && xcrun simctl openurl "$UDID" "$SCHEME://expo-development-client/?url=$(node -e "console.log(encodeURIComponent('http://localhost:$METRO_PORT'))")"
    SNAPSHOT=$(snapshot_with_agent_device "$UDID") || exit 1
    ;;

  device)
    start_api || exit 1
    HOST=$(lan_ip)
    [ -n "$HOST" ] || { echo "No LAN address: the phone reaches Metro and the API over Wi-Fi."; exit 1; }
    API_URL="http://$HOST:$API_PORT"

    if [ "$(uname -s)" = "Darwin" ]; then
      UDID=$(xcrun devicectl list devices -j /dev/stdout 2> /dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const d=JSON.parse(s).result.devices.find(x=>x.hardwareProperties.platform==='iOS');console.log(d?d.hardwareProperties.udid:'')}catch{console.log('')}})")
      [ -n "$UDID" ] || { echo "No iPhone connected (or not trusted / not in developer mode)."; exit 1; }
      build_on_mac "$UDID" || exit 1
      start_metro "$API_URL" || exit 1
      SNAPSHOT=$(snapshot_with_agent_device "$UDID") || exit 1
    else
      command -v ios > /dev/null || { echo "go-ios missing — run 'circon setup --only ios-device'."; exit 1; }
      XTOOL=$(command -v xtool || { [ -x "$HOME/.local/bin/xtool" ] && echo "$HOME/.local/bin/xtool"; })
      [ -n "$XTOOL" ] || { echo "xtool missing — run 'circon setup --only xtool'."; exit 1; }
      "$XTOOL" auth status 2> /dev/null | grep -q "^Logged in" || {
        echo "xtool is not logged in: add an App Store Connect key with 'circon config'."
        exit 1
      }
      UDID=$(ios list 2> /dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).deviceList[0]||'')}catch{console.log('')}})")
      [ -n "$UDID" ] || { echo "No iPhone on USB (is usbmuxd running, and the phone trusted?)."; exit 1; }

      IPA="${CIRCON_IOS_DEV_CLIENT:-.circon/ios-dev-client.ipa}"
      [ -f "$IPA" ] || { echo "No dev-client build at $IPA: download the Codemagic dev-client artifact there."; exit 1; }
      xtool_install "$IPA" "$(shasum "$IPA" | cut -d' ' -f1)-$UDID" "$STAMP" "$APP_ID" "the dev client" || exit 1

      # WebDriverAgent reads the accessibility hierarchy without a Mac. Appium's
      # unsigned build, downloaded by setup; its directory names the version.
      WDA_APP=$(ls -d "$HOME"/.local/share/circon/webdriveragent/*/WebDriverAgentRunner-Runner.app 2> /dev/null | sort -V | tail -n 1)
      [ -n "$WDA_APP" ] || { echo "WebDriverAgent missing — run 'circon setup --only webdriveragent'."; exit 1; }
      xtool_install "$WDA_APP" "$WDA_APP-$UDID" ".circon/ios-wda.stamp" "com.facebook.WebDriverAgentRunner.xctrunner" "WebDriverAgent" || exit 1

      PHONE_APP_ID=$(installed_id "$APP_ID")
      WDA_BUNDLE=$(installed_id "com.facebook.WebDriverAgentRunner.xctrunner")
      if [ -z "$PHONE_APP_ID" ] || [ -z "$WDA_BUNDLE" ]; then
        echo "Installed, but the phone does not list both apps under xtool's bundle ids:"
        ios apps --list --udid="$UDID" 2>&1 | head -n 20
        exit 1
      fi
      start_metro "$API_URL" || exit 1

      ios runwda --bundleid="$WDA_BUNDLE" --testrunnerbundleid="$WDA_BUNDLE" --xctestconfig=WebDriverAgentRunner.xctest --udid="$UDID" > .circon/wda.log 2>&1 &
      CHILD_PIDS="$CHILD_PIDS $!"
      ios forward 8100 8100 --udid="$UDID" > /dev/null 2>&1 &
      CHILD_PIDS="$CHILD_PIDS $!"
      wait_http "http://localhost:8100/status" "" 30 .circon/wda.log || exit 1

      SESSION=$(curl -sf -X POST localhost:8100/session -H 'content-type: application/json' \
        -d "{\"capabilities\":{\"alwaysMatch\":{\"bundleId\":\"$PHONE_APP_ID\"}}}" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).sessionId||JSON.parse(s).value.sessionId))")
      [ -n "$SCHEME" ] && curl -sf -X POST "localhost:8100/session/$SESSION/url" -H 'content-type: application/json' \
        -d "{\"url\":\"$SCHEME://expo-development-client/?url=$(node -e "console.log(encodeURIComponent('http://$HOST:$METRO_PORT'))")\"}" > /dev/null
      sleep 10
      SNAPSHOT=$(curl -sf "localhost:8100/session/$SESSION/source")
    fi
    ;;

  *)
    echo "iosRunnerMode is '$MODE' - nothing to do."
    exit 0
    ;;
esac

[ -n "$SNAPSHOT" ] || { echo "Empty accessibility snapshot from iOS."; exit 1; }
check_labels "$SNAPSHOT" "$EXPECTED"
STATUS=$?
surface_errors ".circon/metro.log" "$API_LOG"
exit $STATUS
