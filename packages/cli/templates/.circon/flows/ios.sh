#!/bin/bash
# Loop 3 - iOS UI gate. The gate passes the runner's iosRunnerMode:
#
#   simulator  macOS runner: an iOS simulator, driven by agent-device
#   device     a real iPhone on USB
#              - macOS runner: built with Xcode, driven by agent-device
#              - Linux runner: the dev-client IPA from Codemagic (workflow
#                dev-client), installed with go-ios; WebDriverAgent opens it
#                against this machine's Metro and reads the hierarchy
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
      UDID=$(ios list 2> /dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).deviceList[0]||'')}catch{console.log('')}})")
      [ -n "$UDID" ] || { echo "No iPhone on USB (is usbmuxd running, and the phone trusted?)."; exit 1; }

      IPA="${CIRCON_IOS_DEV_CLIENT:-.circon/ios-dev-client.ipa}"
      [ -f "$IPA" ] || { echo "No dev-client build at $IPA: download the Codemagic dev-client artifact there."; exit 1; }
      IPA_SUM=$(shasum "$IPA" | cut -d' ' -f1)
      if [ "$(cat "$STAMP" 2> /dev/null)" != "$IPA_SUM" ]; then
        ios install --path="$IPA" --udid="$UDID" > "$BUILD_LOG" 2>&1 || { echo "go-ios could not install the dev client:"; tail -n 20 "$BUILD_LOG"; exit 1; }
        echo "$IPA_SUM" > "$STAMP"
      fi
      start_metro "$API_URL" || exit 1

      # WebDriverAgent (installed on the phone once, signed with your team) is
      # what reads the accessibility hierarchy without a Mac.
      WDA_BUNDLE="${WDA_BUNDLE_ID:-com.facebook.WebDriverAgentRunner.xctrunner}"
      ios runwda --bundleid="$WDA_BUNDLE" --testrunnerbundleid="$WDA_BUNDLE" --xctestconfig=WebDriverAgentRunner.xctest --udid="$UDID" > .circon/wda.log 2>&1 &
      CHILD_PIDS="$CHILD_PIDS $!"
      ios forward 8100 8100 --udid="$UDID" > /dev/null 2>&1 &
      CHILD_PIDS="$CHILD_PIDS $!"
      wait_http "http://localhost:8100/status" "" 30 .circon/wda.log || exit 1

      SESSION=$(curl -sf -X POST localhost:8100/session -H 'content-type: application/json' \
        -d "{\"capabilities\":{\"alwaysMatch\":{\"bundleId\":\"$APP_ID\"}}}" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).sessionId||JSON.parse(s).value.sessionId))")
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
