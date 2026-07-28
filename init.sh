#!/bin/bash
# ==============================================================================
# Autonomous AI Development Machine Setup Script for Fresh Ubuntu Installation
# ==============================================================================
# Installs:
# - NVIDIA Drivers & CUDA Toolkit
# - KVM (Hardware Acceleration) + OpenSSH & GNOME Remote Desktop (RDP from macOS)
# - Docker Engine (Non-root user configuration)
# - Node.js LTS, pnpm, yarn, Expo CLI, JDK 17, Android Studio + headless SDK/AVD
# - Python 3, Pip, Pipx, Aider
# - Ollama + qwen2.5-coder:7b Model
# - Directory Hierarchy (~/Projects, ~/AI-Workspace)
# - Global 'ralph' Autonomous Harness Command in /usr/local/bin/
# - agent-device UI feedback loop (accessibility trees, not screenshots)
# - Telegram reporting + Claude Code review pass
# ==============================================================================

set -e

# ==============================================================================
# STEP 0: INTERACTIVE CONFIGURATION
# Every question the script will ever ask is asked here, before the first
# package is installed, so the ~30 minute install runs start-to-finish
# unattended. Nothing below this block blocks on input.
# ==============================================================================

configure() {
  echo "=========================================================================="
  echo "⚙️  CONFIGURATION — answer these now, then you can walk away."
  echo "=========================================================================="
  echo ""

  # --- 1/3 Anthropic API key --------------------------------------------------
  echo "🔑 [1/3] Anthropic API Key"
  echo "    Powers the Architect (Sonnet) phase of the ralph loop."
  read -rsp "    Paste your API key (hidden, empty to skip): " CFG_ANTHROPIC_KEY
  echo ""
  if [ -n "$CFG_ANTHROPIC_KEY" ]; then
    echo "    ✅ Captured."
  else
    echo "    ⚠️ Skipped — export ANTHROPIC_API_KEY yourself before running ralph."
  fi
  echo ""

  # --- 2/3 Remote Desktop -----------------------------------------------------
  echo "🖥️  [2/3] Remote Desktop (RDP from macOS)"
  echo "    Gateway credentials for the login screen; you still sign in with"
  echo "    your normal Linux account afterwards."
  read -rp "    RDP username [$USER]: " CFG_RDP_USER
  CFG_RDP_USER=${CFG_RDP_USER:-$USER}
  read -rsp "    RDP password (hidden, empty to auto-generate): " CFG_RDP_PASS
  echo ""
  if [ -z "$CFG_RDP_PASS" ]; then
    CFG_RDP_PASS=$(LC_ALL=C tr -dc "A-Za-z0-9" < /dev/urandom | head -c 16)
    CFG_RDP_PASS_GENERATED=1
    echo "    🔐 Generated a random password (printed again at the end)."
  else
    CFG_RDP_PASS_GENERATED=""
    echo "    ✅ Captured."
  fi
  echo ""

  # --- 3/3 Telegram -----------------------------------------------------------
  echo "📨 [3/3] Telegram Reporting (optional)"
  echo "    Bot token from @BotFather, chat ID from @userinfobot."
  read -rp "    Configure Telegram now? [y/N]: " CFG_TG_REPLY
  if [[ $CFG_TG_REPLY =~ ^[Yy] ]]; then
    read -rsp "    Bot token (hidden): " CFG_TG_TOKEN
    echo ""
    read -rp "    Chat ID: " CFG_TG_CHAT

    # Validate now so a typo surfaces here, not in three days of silence
    if [ -n "$CFG_TG_TOKEN" ] && [ -n "$CFG_TG_CHAT" ]; then
      if curl -sf --max-time 10 \
           "https://api.telegram.org/bot$CFG_TG_TOKEN/getMe" > /dev/null 2>&1; then
        echo "    ✅ Token accepted by Telegram."
      else
        echo "    ⚠️ Telegram rejected that token. Saving it anyway — fix it later"
        echo "       in ~/.config/solyd/telegram.env"
      fi
    else
      echo "    ⚠️ Token or chat ID missing. Skipping Telegram."
      CFG_TG_TOKEN=""
    fi
  else
    CFG_TG_TOKEN=""
    echo "    ⚠️ Skipped."
  fi
  echo ""
}

# Defaults, so every later step has a usable value even when nothing is asked
CFG_RDP_USER="$USER"
CFG_RDP_PASS=$(LC_ALL=C tr -dc "A-Za-z0-9" < /dev/urandom | head -c 16)
CFG_RDP_PASS_GENERATED=1

# Read answers from the terminal even when piped (curl ... | bash). Opening
# /dev/tty is the real test — it can exist but be unusable with no controlling
# terminal, so -r alone is not enough.
if [ -t 0 ]; then
  configure
elif { : < /dev/tty; } 2>/dev/null; then
  configure < /dev/tty
else
  echo "⚠️ No terminal available — continuing with defaults, nothing prompted."
  echo "   RDP user '$USER' with a generated password (shown at the end)."
fi

# Prime sudo and keep the timestamp warm, so no password prompt interrupts the
# install halfway through the NVIDIA driver or the Android Studio snap.
sudo -v
while true; do sudo -n true; sleep 50; kill -0 "$$" 2>/dev/null || exit; done 2>/dev/null &
SUDO_KEEPALIVE_PID=$!
trap 'kill "$SUDO_KEEPALIVE_PID" 2>/dev/null || true' EXIT

echo "=========================================================================="
echo "🚀 Starting Full AI & Software Development Environment Setup..."
echo "   Configuration is done — the rest runs unattended."
echo "=========================================================================="

# 1. System Updates & Essential Utilities
echo "📦 [1/12] Updating System & Installing Essential Tools..."
sudo apt update && sudo apt upgrade -y
sudo apt install -y \
  curl wget git build-essential unzip jq tmux screen htop \
  software-properties-common ca-certificates gnupg openssl \
  openssh-server gnome-remote-desktop openjdk-17-jdk

# Enable SSH for remote management from macOS (RDP is configured in step 9)
sudo systemctl enable --now ssh

# 2. NVIDIA Drivers & CUDA Setup
echo "🟢 [2/12] Auto-detecting & Installing NVIDIA Drivers & CUDA..."
sudo ubuntu-drivers install
sudo apt install -y nvidia-cuda-toolkit

# 3. KVM / Virtualization (For Android Emulator Acceleration)
echo "⚡ [3/12] Setting up KVM for Android Emulation..."
sudo apt install -y qemu-system libvirt-daemon-system libvirt-clients bridge-utils virt-manager
sudo usermod -aG kvm $USER
sudo usermod -aG libvirt $USER

# 4. Docker Engine Setup
echo "🐳 [4/12] Installing Docker Engine..."
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com -o get-docker.sh
  sudo sh get-docker.sh
  rm get-docker.sh
fi
sudo usermod -aG docker $USER

# 5. Node.js (LTS), Package Managers & Android Studio
echo "🟢 [5/12] Installing Node.js LTS, pnpm, Expo CLI, and Android Studio..."
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g npm@latest pnpm yarn expo-cli

# Install Android Studio cleanly via Snap
sudo snap install android-studio --classic

# ------------------------------------------------------------------------------
# Headless Android SDK provisioning
#
# The snap ships only the IDE. Without this, the first launch drops you into the
# setup wizard to download the SDK by hand. Provisioning it with sdkmanager here
# means Android Studio finds a complete SDK on first run and skips the wizard,
# and adb/gradle/expo work from the shell immediately.
# ------------------------------------------------------------------------------
echo "🤖 [5/12] Provisioning the Android SDK (headless, no wizard)..."

export ANDROID_HOME="$HOME/Android/Sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"

provision_android_sdk() {
  mkdir -p "$ANDROID_HOME/cmdline-tools"

  if [ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
    # Resolve the current build number from the download page so this does not
    # rot; fall back to a known-good build if the page layout changes.
    local url tmp
    url=$(curl -fsSL --max-time 30 https://developer.android.com/studio 2>/dev/null \
          | grep -oE "https://dl\.google\.com/android/repository/commandlinetools-linux-[0-9]+_latest\.zip" \
          | head -1)
    url="${url:-https://dl.google.com/android/repository/commandlinetools-linux-15859902_latest.zip}"
    echo "   Fetching command-line tools: $url"

    tmp=$(mktemp -d)
    curl -fL --retry 3 --progress-bar -o "$tmp/tools.zip" "$url" || { rm -rf "$tmp"; return 1; }
    unzip -q -o "$tmp/tools.zip" -d "$tmp" || { rm -rf "$tmp"; return 1; }
    rm -rf "$ANDROID_HOME/cmdline-tools/latest"
    mv "$tmp/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest" || { rm -rf "$tmp"; return 1; }
    rm -rf "$tmp"
  fi

  export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
  command -v sdkmanager > /dev/null || return 1

  # sdkmanager warns on every invocation without this file
  mkdir -p "$HOME/.android"
  touch "$HOME/.android/repositories.cfg"

  # Nothing installs until the licenses are accepted
  yes | sdkmanager --licenses > /dev/null 2>&1 || true

  # Resolve the newest STABLE versions instead of pinning ones that will rot.
  # Preview platforms use letter code names (android-Baklava) and are filtered
  # out by matching digits only.
  local list api build_tools sys_image
  list=$(sdkmanager --list 2>/dev/null)
  api=$(echo "$list" | grep -oE "platforms;android-[0-9]+" | sort -t- -k2 -n -u | tail -1)
  build_tools=$(echo "$list" | grep -oE "build-tools;[0-9.]+" | sort -V -u | tail -1)

  if [ -z "$api" ]; then
    echo "   ⚠️ Could not read the SDK package list."
    return 1
  fi
  API_LEVEL="${api##*android-}"
  echo "   Latest stable platform: android-$API_LEVEL"

  # Emulator image: plain google_apis is preferred, playstore is the fallback
  sys_image=$(echo "$list" | grep -oE "system-images;android-$API_LEVEL;google_apis;x86_64" | head -1)
  [ -z "$sys_image" ] && sys_image=$(echo "$list" \
    | grep -oE "system-images;android-$API_LEVEL;google_apis_playstore;x86_64" | head -1)

  sdkmanager --install \
    "platform-tools" \
    "platforms;android-$API_LEVEL" \
    "${build_tools:-build-tools;35.0.0}" \
    "emulator" \
    ${sys_image:+"$sys_image"} > /dev/null || return 1

  # A ready-to-boot emulator, so `expo run:android` has a target on day one
  if [ -n "$sys_image" ] && ! avdmanager list avd 2>/dev/null | grep -q "Name: solyd_pixel"; then
    local device_flag=""
    avdmanager list device 2>/dev/null | grep -q "pixel_7" && device_flag="pixel_7"
    echo "no" | avdmanager create avd -n solyd_pixel -k "$sys_image" \
      ${device_flag:+-d "$device_flag"} --force > /dev/null 2>&1 \
      && echo "   Created AVD 'solyd_pixel' ($sys_image)"
  fi

  return 0
}

if provision_android_sdk; then
  echo "✅ Android SDK ready at $ANDROID_HOME (API $API_LEVEL) — no wizard needed."
else
  echo "⚠️ Android SDK provisioning failed. Android Studio will still work, but"
  echo "   its first-run wizard will ask you to download the SDK manually."
fi

# 6. Python Tooling & Aider
echo "🐍 [6/12] Installing UV, and Aider..."
curl -LsSf https://astral.sh/uv/install.sh | sh
uv tool install --python 3.12 aider-chat
uv tool update-shell

# 7. Ollama & Qwen Coder Model Setup
echo "🦙 [7/12] Installing Ollama & Pulling qwen2.5-coder:7b..."
curl -fsSL https://ollama.com/install.sh | sh
sudo systemctl enable --now ollama
sleep 5
ollama pull qwen2.5-coder:7b

# 8. Directory Structure & Global 'ralph' Harness
echo "📁 [8/12] Creating Project Workspace & Global 'ralph' Harness..."

# Sensible Directory Structure
mkdir -p ~/Projects/apps                   # React Native, iOS/Android, Web Apps
mkdir -p ~/Projects/servers                # Node.js, Python, Databases, Backend APIs
mkdir -p ~/Projects/business-and-marketing # Copywriting, Business Models, Strategy
mkdir -p ~/Projects/research-and-docs      # Tech Research, System Architecture Specs
mkdir -p ~/AI-Workspace/templates

# Starter PRD Template
cat << 'EOF' > ~/AI-Workspace/templates/PRD.md
# Project Specification (PRD)

## Objective
- Define the main goal of this module/project.

## Task Backlog
- [ ] Task 1: Setup project structure and basic dependencies.
- [ ] Task 2: Create unit tests for core logic.
- [ ] Task 3: Implement core functionality.
EOF

touch ~/AI-Workspace/templates/progress.txt

# Create Global 'ralph' Executable Script in /usr/local/bin
sudo bash -c 'cat << "EOF" > /usr/local/bin/ralph
#!/bin/bash
# =======================================================
# Production Ralph Loop Harness: HYBRID ARCHITECT MODE
# (Claude Sonnet + Local Qwen)
# =======================================================

MAX_LOOPS=${1:-20}
STUCK_LIMIT=3
STUCK_COUNT=0

# Aiders "sonnet" alias automatically resolves to the newest Claude Sonnet version
ARCHITECT_MODEL="sonnet"
EDITOR_MODEL="ollama_chat/qwen2.5-coder:7b"

# Ensure API Key is present for Claude
if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "❌ Error: ANTHROPIC_API_KEY is not set."
  echo "Please export your Anthropic key before running:"
  echo "export ANTHROPIC_API_KEY='sk-ant-yourkey...'"
  exit 1
fi

if [ ! -d ".git" ]; then
  echo "❌ Error: Must be run inside a Git repository."
  exit 1
fi

# Seed PRD.md and progress.txt if they do not exist
if [ ! -f "PRD.md" ]; then
  if [ -f "$HOME/AI-Workspace/templates/PRD.md" ]; then
    cp "$HOME/AI-Workspace/templates/PRD.md" ./PRD.md
    echo "📋 Seeded default PRD.md"
  else
    touch PRD.md
  fi
fi

touch progress.txt

AIDER_BIN=$(command -v aider || echo "$HOME/.local/bin/aider")

PROJECT_NAME=$(basename "$PWD")
STARTED_AT=$(date +%s)
COMMITS_MADE=0

# Baselines so the report can describe exactly what THIS run changed
START_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "")
PROGRESS_START=$(wc -l < progress.txt 2>/dev/null | tr -d "[:space:]")
PROGRESS_START=${PROGRESS_START:-0}

LOG_DIR="$HOME/.local/state/ralph"
mkdir -p "$LOG_DIR"
RUN_LOG="$LOG_DIR/$PROJECT_NAME-$(date +%Y%m%d-%H%M%S).log"
TEST_LOG="$LOG_DIR/.test-output.$$"
trap "rm -f \"$TEST_LOG\"" EXIT

# Telegram reporting is optional: no config, no output, no failure
notify() {
  command -v solyd-notify > /dev/null 2>&1 && solyd-notify "$1"
  return 0
}

elapsed() {
  local secs=$(( $(date +%s) - STARTED_AT ))
  printf "%dh %dm" $((secs / 3600)) $(( (secs % 3600) / 60 ))
}

# The commits this run produced. Subjects carry the PRD task name, so this
# doubles as the list of what actually got built.
work_done() {
  if [ -n "$START_COMMIT" ]; then
    git log "$START_COMMIT"..HEAD --format="- %s" 2>/dev/null
  else
    git log --format="- %s" 2>/dev/null
  fi
}

VERIFY_EVERY=${VERIFY_EVERY:-5}
VERIFY_NOTES=""
LAST_FAILURE=""

# Second opinion from Claude Code on the accumulated diff. Advisory only: it
# feeds the next prompt and Telegram, and never fails the loop.
verify_pass() {
  command -v solyd-verify > /dev/null 2>&1 || return 0
  echo "🔍 Verification pass: $1"

  local out
  out=$(solyd-verify "$1" 2>> "$RUN_LOG")

  if [ -n "$out" ]; then
    VERIFY_NOTES="A reviewer looked at your recent commits and found:
$out
Address these before starting new work."
    echo "$out"
    echo "$out" >> "$RUN_LOG"
    notify "🔍 ralph REVIEW: $PROJECT_NAME
$1

$out"
  else
    VERIFY_NOTES=""
    echo "   Reviewer found nothing to report."
  fi
  return 0
}

# Loop 3 target, if one has been configured
IOS_RUNNER_MODE=none
[ -f "$HOME/.config/solyd/ios-runner.env" ] && . "$HOME/.config/solyd/ios-runner.env"

# Tiered quality gate: cheapest signal first, stop at the first failure.
# Every tier is opt-in by file presence, so a project with none of them behaves
# exactly as before. GATE_TIER names the tier that failed, for the alert.
run_gate() {
  GATE_TIER=""
  : > "$TEST_LOG"

  # Tier 1 - typecheck (seconds)
  if [ -f "tsconfig.json" ] && [ -x "node_modules/.bin/tsc" ]; then
    GATE_TIER="typecheck"
    echo "   -> tsc --noEmit"
    node_modules/.bin/tsc --noEmit >> "$TEST_LOG" 2>&1 || return 1
  fi

  # Tier 2 - unit tests
  if [ -f "package.json" ] && \
     node -e "var p=require(\"./package.json\");process.exit(p.scripts&&p.scripts.test?0:1)" 2>/dev/null; then
    GATE_TIER="unit tests"
    echo "   -> npm test"
    npm test >> "$TEST_LOG" 2>&1 || return 1
  fi

  # Tiers 3-5 - UI surfaces. Each is a project-provided flow script that starts
  # the app and asserts against the accessibility tree via agent-device. The
  # expo-app scaffold ships these; other projects simply have none.
  if command -v agent-device > /dev/null 2>&1; then

    if [ -x ".solyd/flows/web.sh" ]; then
      GATE_TIER="web UI"
      echo "   -> web UI flow"
      ./.solyd/flows/web.sh >> "$TEST_LOG" 2>&1 || return 1
    fi

    if [ -x ".solyd/flows/android.sh" ] && adb devices 2>/dev/null | grep -q "device$"; then
      GATE_TIER="android UI"
      echo "   -> android UI flow"
      ./.solyd/flows/android.sh >> "$TEST_LOG" 2>&1 || return 1
    fi

    if [ -x ".solyd/flows/ios.sh" ] && [ "$IOS_RUNNER_MODE" != "none" ]; then
      GATE_TIER="ios UI"
      echo "   -> ios UI flow ($IOS_RUNNER_MODE)"
      ./.solyd/flows/ios.sh >> "$TEST_LOG" 2>&1 || return 1
    fi
  fi

  GATE_TIER=""
  return 0
}

# Whatever the agent appended to progress.txt during this run: its own account
# of what it did, in its own words.
new_notes() {
  local total
  total=$(wc -l < progress.txt 2>/dev/null | tr -d "[:space:]")
  total=${total:-0}
  if [ "$total" -gt "$PROGRESS_START" ]; then
    tail -n $((total - PROGRESS_START)) progress.txt \
      | grep -v "ALL_TASKS_COMPLETE" | grep -v "^[[:space:]]*$" | tail -n 6
  fi
}

echo "🚀 Starting Hybrid Ralph Loop (Max Iterations: $MAX_LOOPS)..."
echo "🧠 Architect: $ARCHITECT_MODEL"
echo "✍️  Editor:   $EDITOR_MODEL"

for ((i=1; i<=MAX_LOOPS; i++)); do
  echo ""
  echo "=================================================="
  echo "🔁 Loop Iteration #$i of $MAX_LOOPS"
  echo "=================================================="

  PROMPT="Pick the SINGLE highest-priority incomplete task from PRD.md. Implement ONLY that task. Update PRD.md and progress.txt with your changes. If all tasks are finished, append '\''ALL_TASKS_COMPLETE'\'' to progress.txt.

Every interactive element you create MUST carry both a testID and an accessibilityLabel. The automated UI gate addresses elements by those two props and is blind to anything that lacks them.
$LAST_FAILURE
$VERIFY_NOTES"

  echo "--- iteration $i ---" >> "$RUN_LOG"

  # Execute Aider in Hybrid Architect Mode
  "$AIDER_BIN" PRD.md progress.txt \
        --architect \
        --model "$ARCHITECT_MODEL" \
        --editor-model "$EDITOR_MODEL" \
        --message "$PROMPT" \
        --yes-always \
        --no-auto-commits 2>&1 | tee -a "$RUN_LOG"

  echo "🧪 Running Backpressure Quality Gate..."

  run_gate
  TEST_STATUS=$?
  cat "$TEST_LOG"
  cat "$TEST_LOG" >> "$RUN_LOG"

  if [ $TEST_STATUS -eq 0 ]; then
    echo "✅ Gate passed!"
    LAST_FAILURE=""
    git add .

    if ! git diff --cached --quiet; then
      # Name the commit after the PRD task that just flipped to done, so the
      # git log becomes a readable record of what the agent built
      TASK_DONE=$(git diff --cached -U0 -- PRD.md \
                  | grep "^+- \[[xX]\]" | head -1 | sed "s/^+- \[[xX]\][[:space:]]*//")
      if [ -n "$TASK_DONE" ]; then
        git commit -m "ralph(iter-$i): $TASK_DONE"
      else
        git commit -m "ralph(iter-$i): completed automated task"
      fi
      COMMITS_MADE=$((COMMITS_MADE + 1))
      STUCK_COUNT=0
    else
      echo "⚠️ Aider made no file changes this iteration."
    fi
  else
    echo "❌ Gate failed at the ${GATE_TIER:-unknown} tier! Reverting bad iteration code..."
    git reset --hard HEAD
    git clean -fd

    # Tell the next iteration exactly which surface broke and how, so the agent
    # is not guessing at what the UI actually did
    LAST_FAILURE="The previous attempt failed the ${GATE_TIER:-quality} gate:
$(tail -n 25 "$TEST_LOG" 2>/dev/null)"

    ((STUCK_COUNT++))
    echo "⚠️ Failure count: $STUCK_COUNT/$STUCK_LIMIT"

    # A failing gate is the moment a second opinion is worth paying for
    verify_pass "gate failure at the ${GATE_TIER:-quality} tier (iteration $i)"

    if [ $STUCK_COUNT -ge $STUCK_LIMIT ]; then
      echo "🛑 CIRCUIT BREAKER TRIGGERED: Agent failed $STUCK_LIMIT consecutive times. Halting."
      notify "🛑 ralph HALTED: $PROJECT_NAME
Circuit breaker tripped after $STUCK_LIMIT consecutive failures.
Failing tier: ${GATE_TIER:-unknown}
Stopped at iteration $i of $MAX_LOOPS after $(elapsed).

Completed before the failure ($COMMITS_MADE commits):
$(work_done)

Last agent notes:
$(new_notes)

Why it failed (${GATE_TIER:-gate}):
$(tail -n 12 "$TEST_LOG" 2>/dev/null)

Full log: $RUN_LOG"
      exit 1
    fi
  fi

  # Scheduled second opinion on healthy runs
  if [ $((i % VERIFY_EVERY)) -eq 0 ] && [ $TEST_STATUS -eq 0 ]; then
    verify_pass "scheduled review at iteration $i"
  fi

  if grep -q "ALL_TASKS_COMPLETE" progress.txt 2>/dev/null; then
    echo "🎉 All tasks in PRD.md are completed! Exiting Ralph Loop successfully."
    notify "🎉 ralph FINISHED: $PROJECT_NAME
All PRD tasks complete — $i iterations, $COMMITS_MADE commits, $(elapsed).

What got done:
$(work_done)

Last agent notes:
$(new_notes)

Log: $RUN_LOG"
    ALL_DONE=1
    break
  fi

done

# Loop ran out of iterations without finishing the backlog
if [ -z "$ALL_DONE" ]; then
  OPEN_TASKS=$(grep -c "^- \[ \]" PRD.md 2>/dev/null || true)
  notify "⏸️ ralph PAUSED: $PROJECT_NAME
Hit the $MAX_LOOPS iteration limit — ${OPEN_TASKS:-?} tasks still open.
$COMMITS_MADE commits, $(elapsed) runtime.

What got done:
$(work_done)

Last agent notes:
$(new_notes)

Still open:
$(grep "^- \[ \]" PRD.md 2>/dev/null | head -5)

Run ralph again to continue. Log: $RUN_LOG"
fi
EOF'

sudo chmod +x /usr/local/bin/ralph

# 9. Native Remote Desktop (GNOME Remote Desktop / grdctl)
echo "🖥️  [9/12] Configuring Ubuntu's Native Remote Desktop (RDP)..."

# Ubuntu's built-in RDP server and xrdp both bind port 3389 — make sure only the
# native GNOME implementation is active if xrdp was installed previously.
if systemctl list-unit-files 2>/dev/null | grep -q '^xrdp'; then
  echo "⚠️ Disabling legacy xrdp in favour of GNOME Remote Desktop..."
  sudo systemctl disable --now xrdp xrdp-sesman 2>/dev/null || true
fi

# Credentials were collected in step 0
RDP_USER="$CFG_RDP_USER"
RDP_PASS="$CFG_RDP_PASS"
RDP_PASS_GENERATED="$CFG_RDP_PASS_GENERATED"
RDP_SUMMARY=""

# ------------------------------------------------------------------------------
# 9a. PRIMARY: system-level "Remote Login" (GNOME 46+ / Ubuntu 24.04+)
#
# This is the daemon that answers on port 3389 straight after a cold boot, with
# nobody signed in. Connecting drops you at GDM, where you log in with your
# normal Linux account — so no Automatic Login is required and the machine stays
# locked when it is unattended.
# ------------------------------------------------------------------------------
if grdctl --help 2>&1 | grep -q -- '--system'; then
  echo "🔐 Setting up system-level Remote Login (works at the login screen)..."

  SYS_CERT_DIR="/var/lib/gnome-remote-desktop"
  sudo mkdir -p "$SYS_CERT_DIR"
  if [ ! -f "$SYS_CERT_DIR/rdp-tls.key" ]; then
    sudo openssl req -new -newkey rsa:4096 -days 3650 -nodes -x509 \
      -subj "/C=DE/O=solyd-machine/CN=$(hostname)" \
      -out "$SYS_CERT_DIR/rdp-tls.crt" \
      -keyout "$SYS_CERT_DIR/rdp-tls.key" 2>/dev/null
  fi
  # The daemon runs as the 'gnome-remote-desktop' user and silently refuses
  # connections if it cannot read its own key — this is the #1 failure cause.
  sudo chown gnome-remote-desktop:gnome-remote-desktop \
    "$SYS_CERT_DIR/rdp-tls.crt" "$SYS_CERT_DIR/rdp-tls.key" || true
  sudo chmod 644 "$SYS_CERT_DIR/rdp-tls.crt"
  sudo chmod 600 "$SYS_CERT_DIR/rdp-tls.key"

  sudo grdctl --system rdp set-tls-cert "$SYS_CERT_DIR/rdp-tls.crt"
  sudo grdctl --system rdp set-tls-key "$SYS_CERT_DIR/rdp-tls.key"
  sudo grdctl --system rdp set-credentials "$RDP_USER" "$RDP_PASS"
  sudo grdctl --system rdp enable
  sudo systemctl enable --now gnome-remote-desktop.service || true

  RDP_SYSTEM_ENABLED=1
  RDP_SUMMARY="   Port 3389 -> login screen (gateway user '$RDP_USER', then your Linux account)"
  echo "✅ Remote Login enabled — reachable on port 3389 after a reboot."
else
  echo "⚠️ This Ubuntu release predates GNOME 46, so system-level Remote Login is"
  echo "   unavailable. RDP will only answer while you are logged in locally;"
  echo "   enable Automatic Login in Settings > System > Users to work around it."
fi

# ------------------------------------------------------------------------------
# 9b. SECONDARY: per-user screen sharing — attaches to the session that is
# already running, so a remote login and a local login see the same desktop.
# Moved to 3390 where supported so it cannot fight the system daemon for 3389.
# ------------------------------------------------------------------------------
USER_CERT_DIR="$HOME/.local/share/gnome-remote-desktop/certificates"
mkdir -p "$USER_CERT_DIR"
if [ ! -f "$USER_CERT_DIR/rdp-tls.key" ]; then
  openssl req -new -newkey rsa:4096 -days 3650 -nodes -x509 \
    -subj "/C=DE/O=solyd-machine/CN=$(hostname)" \
    -out "$USER_CERT_DIR/rdp-tls.crt" \
    -keyout "$USER_CERT_DIR/rdp-tls.key" 2>/dev/null
  chmod 600 "$USER_CERT_DIR/rdp-tls.key"
fi

# grdctl and gsettings both need the user session bus (absent over plain SSH)
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=/run/user/$(id -u)/bus}"

if [ -S "/run/user/$(id -u)/bus" ]; then
  grdctl rdp set-tls-cert "$USER_CERT_DIR/rdp-tls.crt"
  grdctl rdp set-tls-key "$USER_CERT_DIR/rdp-tls.key"
  grdctl rdp set-credentials "$RDP_USER" "$RDP_PASS"
  grdctl rdp disable-view-only   # allow full keyboard/mouse control

  USER_RDP_PORT=3389
  if [ -n "$RDP_SYSTEM_ENABLED" ]; then
    if grdctl rdp --help 2>&1 | grep -q 'set-port'; then
      grdctl rdp set-port 3390
      USER_RDP_PORT=3390
    else
      echo "⚠️ grdctl cannot move the user service off 3389 on this release —"
      echo "   leaving it disabled so it does not clash with Remote Login."
      USER_RDP_PORT=""
    fi
  fi

  if [ -n "$USER_RDP_PORT" ]; then
    grdctl rdp enable
    gsettings set org.gnome.desktop.remote-desktop.rdp enable true
    gsettings set org.gnome.desktop.remote-desktop.rdp view-only false
    # Spawn a virtual display so the desktop is usable with no monitor attached
    gsettings set org.gnome.desktop.remote-desktop.rdp screen-share-mode extend 2>/dev/null || true
    systemctl --user enable --now gnome-remote-desktop.service
    systemctl --user restart gnome-remote-desktop.service
    RDP_SUMMARY="$RDP_SUMMARY
   Port $USER_RDP_PORT -> your live desktop session (user '$RDP_USER')"
    echo "✅ Screen sharing enabled for '$RDP_USER' on port $USER_RDP_PORT."
  else
    grdctl rdp disable
  fi
else
  echo "⚠️ No graphical session bus found — screen sharing for the live session was"
  echo "   skipped. Re-run this step from the Ubuntu desktop to enable it."
fi

# Keep the user's services alive after logout so they stay reachable headless
sudo loginctl enable-linger "$USER" || true

# Open the RDP ports if the firewall is active
if command -v ufw &> /dev/null && sudo ufw status | grep -q "Status: active"; then
  sudo ufw allow 3389/tcp
  sudo ufw allow 3390/tcp
fi

# 10. Telegram Reporting (task notifications + daily digest)
echo "📨 [10/12] Installing Telegram Notifier & Daily Report..."

# ------------------------------------------------------------------------------
# solyd-notify: sends a plain-text Telegram message. Takes the text as arguments
# or on stdin. Exits quietly when Telegram is not configured, so the ralph loop
# never fails because of a missing token.
# ------------------------------------------------------------------------------
sudo bash -c 'cat << "EOF" > /usr/local/bin/solyd-notify
#!/bin/bash
CONFIG="${SOLYD_TELEGRAM_CONFIG:-$HOME/.config/solyd/telegram.env}"

[ -f "$CONFIG" ] || exit 0
# shellcheck source=/dev/null
. "$CONFIG"
[ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ] || exit 0

if [ $# -gt 0 ]; then MSG="$*"; else MSG="$(cat)"; fi
[ -n "$MSG" ] || exit 0

# Telegram rejects anything over 4096 characters
if [ ${#MSG} -gt 4000 ]; then
  MSG="${MSG:0:4000}
... (truncated)"
fi

HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 \
  -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
  --data-urlencode "chat_id=$TELEGRAM_CHAT_ID" \
  --data-urlencode "text=$MSG" \
  --data-urlencode "disable_web_page_preview=true")

if [ "$HTTP" != "200" ]; then
  echo "solyd-notify: Telegram API returned HTTP $HTTP" >&2
  exit 1
fi
EOF'
sudo chmod +x /usr/local/bin/solyd-notify

# ------------------------------------------------------------------------------
# solyd-daily-report: walks ~/Projects, summarises what the agents committed in
# the last 24h plus machine health, and pushes it to Telegram.
# Run manually any time, or let the systemd timer fire it at 20:00.
# ------------------------------------------------------------------------------
sudo bash -c 'cat << "EOF" > /usr/local/bin/solyd-daily-report
#!/bin/bash
SINCE="${SOLYD_REPORT_SINCE:-24 hours ago}"
PROJECT_ROOT="${SOLYD_PROJECT_ROOT:-$HOME/Projects}"

REPORT=""
# Appends one line plus a real newline (avoids fragile escaping in this heredoc)
add() {
  REPORT="$REPORT$1
"
}

add "📊 Solyd Daily Report - $(date "+%a %d %b %Y")"
add "------------------------------"

TOTAL_COMMITS=0
TOTAL_RALPH=0
ACTIVE=""

while IFS= read -r gitdir; do
  repo="$(dirname "$gitdir")"
  commits=$(git -C "$repo" log --since="$SINCE" --oneline 2>/dev/null | wc -l | tr -d "[:space:]")
  [ "${commits:-0}" -eq 0 ] && continue

  ralph_commits=$(git -C "$repo" log --since="$SINCE" --oneline --grep="^ralph(iter" 2>/dev/null | wc -l | tr -d "[:space:]")
  TOTAL_COMMITS=$((TOTAL_COMMITS + commits))
  TOTAL_RALPH=$((TOTAL_RALPH + ralph_commits))

  name="${repo#$PROJECT_ROOT/}"
  ACTIVE="$ACTIVE
📁 $name - $commits commits ($ralph_commits from ralph)
"

  # What was actually built. Commit subjects carry the PRD task name.
  subjects=$(git -C "$repo" log --since="$SINCE" --format="   · %s" 2>/dev/null | head -6)
  [ -n "$subjects" ] && ACTIVE="$ACTIVE$subjects
"
  extra=$((commits - 6))
  [ "$extra" -gt 0 ] && ACTIVE="$ACTIVE   · ... and $extra more
"

  if [ -f "$repo/PRD.md" ]; then
    open_tasks=$(grep -c "^- \[ \]" "$repo/PRD.md" 2>/dev/null || true)
    done_tasks=$(grep -c "^- \[[xX]\]" "$repo/PRD.md" 2>/dev/null || true)
    ACTIVE="$ACTIVE   PRD: ${done_tasks:-0} done / ${open_tasks:-0} open
"
  fi

  # The agent latest note to itself - the closest thing to a status message
  if [ -f "$repo/progress.txt" ]; then
    last_note=$(grep -v "ALL_TASKS_COMPLETE" "$repo/progress.txt" 2>/dev/null \
                | grep -v "^[[:space:]]*$" | tail -n 1 | cut -c1-180)
    [ -n "$last_note" ] && ACTIVE="$ACTIVE   Last note: $last_note
"
    if grep -q "ALL_TASKS_COMPLETE" "$repo/progress.txt" 2>/dev/null; then
      ACTIVE="$ACTIVE   ✅ backlog finished
"
    fi
  fi
done < <(find "$PROJECT_ROOT" -maxdepth 4 -type d -name .git 2>/dev/null)

if [ -n "$ACTIVE" ]; then
  add "🤖 $TOTAL_COMMITS commits in 24h, $TOTAL_RALPH from autonomous loops"
  REPORT="$REPORT$ACTIVE"
else
  add "😴 No repository activity in the last 24h."
fi

# Machine health
add ""
add "🖥️ Machine"
add "- Disk: $(df -h "$HOME" | awk "NR==2 {print \$4\" free of \"\$2\" (\"\$5\" used)\"}")"
add "- Load:$(uptime | sed "s/.*load average[s]*://")"

if command -v nvidia-smi > /dev/null 2>&1; then
  GPU=$(nvidia-smi --query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu \
        --format=csv,noheader,nounits 2>/dev/null | head -1)
  [ -n "$GPU" ] && add "- GPU: $(echo "$GPU" | awk -F", " "{print \$1\" | \"\$2\"% util | \"\$3\"/\"\$4\" MiB | \"\$5\"C\"}")"
fi

if systemctl is-active --quiet ollama 2>/dev/null; then
  add "- Ollama: running"
else
  add "- Ollama: STOPPED"
fi

if [ "$1" = "--stdout" ]; then
  echo "$REPORT"
else
  echo "$REPORT" | solyd-notify
fi
EOF'
sudo chmod +x /usr/local/bin/solyd-daily-report

# ------------------------------------------------------------------------------
# Schedule the digest at 20:00 daily via a user-level systemd timer. Linger was
# enabled in step 9, so this fires even when nobody is logged in.
# ------------------------------------------------------------------------------
mkdir -p ~/.config/systemd/user

cat << 'EOF' > ~/.config/systemd/user/solyd-daily-report.service
[Unit]
Description=Solyd daily AI activity report via Telegram

[Service]
Type=oneshot
ExecStart=/usr/local/bin/solyd-daily-report
EOF

cat << 'EOF' > ~/.config/systemd/user/solyd-daily-report.timer
[Unit]
Description=Send the Solyd daily AI activity report

[Timer]
OnCalendar=*-*-* 20:00:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

# ------------------------------------------------------------------------------
# Write the Telegram credentials captured in step 0
# ------------------------------------------------------------------------------
mkdir -p ~/.config/solyd

if [ -n "$CFG_TG_TOKEN" ] && [ -n "$CFG_TG_CHAT" ]; then
  umask 077
  cat << EOF > ~/.config/solyd/telegram.env
# Telegram credentials for solyd-notify / solyd-daily-report
TELEGRAM_BOT_TOKEN="$CFG_TG_TOKEN"
TELEGRAM_CHAT_ID="$CFG_TG_CHAT"
EOF
  chmod 600 ~/.config/solyd/telegram.env

  if solyd-notify "✅ Solyd machine setup complete. Reporting is live."; then
    echo "✅ Telegram connected — check your chat for the test message."
    TELEGRAM_READY=1
  else
    echo "⚠️ Could not reach Telegram. Verify the token/chat ID in"
    echo "   ~/.config/solyd/telegram.env and retry with: solyd-notify test"
  fi
else
  echo "⚠️ Telegram not configured. Add credentials to ~/.config/solyd/telegram.env"
fi

# Activate the timer (needs the user session bus)
if [ -S "/run/user/$(id -u)/bus" ]; then
  systemctl --user daemon-reload
  systemctl --user enable --now solyd-daily-report.timer
  echo "⏰ Daily report scheduled for 20:00."
else
  echo "⚠️ No user session bus — enable the digest later with:"
  echo "   systemctl --user enable --now solyd-daily-report.timer"
fi

# 11. Agent UI Feedback Tooling (Expo / React Native)
echo "👁️  [11/12] Installing Agent UI Feedback Tooling (agent-device)..."

# ------------------------------------------------------------------------------
# Gives the ralph loop eyes and hands on a running app. agent-device reads the
# accessibility tree as structured data — not screenshots — and drives taps and
# typing, with the same vocabulary across web, Android and iOS.
#
# Loops 1 (Expo web) and 2 (Android emulator) run entirely on this machine.
# Loop 3 (iOS) needs Apple hardware and stays stubbed until a runner exists.
# ------------------------------------------------------------------------------

provision_agent_tooling() {
  # agent-device needs Node 22.12+ generally, 24+ for its web automation.
  # setup_lts.x should already satisfy this — assert rather than assume.
  local major minor
  major=$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)
  minor=$(node -p "process.versions.node.split('.')[1]" 2>/dev/null || echo 0)

  if [ "$major" -lt 24 ]; then
    if [ "$major" -lt 22 ] || { [ "$major" -eq 22 ] && [ "$minor" -lt 12 ]; }; then
      echo "   Node $major.$minor is below the 22.12 minimum — upgrading to 24.x"
    else
      echo "   Node $major.$minor works, but web automation needs 24+ — upgrading"
    fi
    curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - || return 1
    sudo apt install -y nodejs || return 1
    echo "   Node is now $(node --version)"
  else
    echo "   Node $(node --version) satisfies agent-device requirements."
  fi

  # Chromium runtime libraries for the web surface. Playwright ships the most
  # reliable dependency list for headless Chromium on Ubuntu, so borrow it.
  sudo npx --yes playwright install-deps chromium > /dev/null 2>&1 \
    || echo "   ⚠️ Chromium system deps incomplete — web surface may need attention."

  sudo npm install -g agent-device @anthropic-ai/claude-code eas-cli || return 1
  return 0
}

# ------------------------------------------------------------------------------
# solyd-verify: the second-opinion pass. aider (Claude architect + local qwen)
# writes the code; Claude Code reviews the accumulated diff for correctness and
# security every few iterations. Prints findings, or nothing when clean.
# Advisory by design — it never fails the loop.
# ------------------------------------------------------------------------------
sudo bash -c 'cat << "EOF" > /usr/local/bin/solyd-verify
#!/bin/bash
REASON="${1:-scheduled review}"
VERIFY_MODEL="${VERIFY_MODEL:-sonnet}"
VERIFY_BUDGET="${VERIFY_BUDGET:-0.50}"
LAST_REF_FILE=".solyd/.last-verified"

command -v claude > /dev/null 2>&1 || exit 0
[ -d ".git" ] || exit 0
[ -n "$ANTHROPIC_API_KEY" ] || exit 0

mkdir -p .solyd

# Review only what changed since the previous pass; fall back to the whole
# history the first time.
LAST_REF=$(cat "$LAST_REF_FILE" 2>/dev/null)
if [ -z "$LAST_REF" ] || ! git cat-file -e "$LAST_REF" 2>/dev/null; then
  LAST_REF=$(git log --format=%H 2>/dev/null | tail -1)
fi
[ -n "$LAST_REF" ] || exit 0

DIFF=$(git diff "$LAST_REF"..HEAD 2>/dev/null)
[ -n "$DIFF" ] || exit 0

# Keep an unattended review affordable
DIFF_LINES=$(echo "$DIFF" | wc -l | tr -d "[:space:]")
if [ "${DIFF_LINES:-0}" -gt 3000 ]; then
  DIFF="$(echo "$DIFF" | head -n 3000)
... diff truncated at 3000 lines of $DIFF_LINES"
fi

PROMPT="You are reviewing commits written autonomously by an AI coding loop.
Trigger: $REASON

Review the diff for:
1. Correctness bugs - logic errors, unhandled cases, broken state
2. Security - injection, secrets committed to source, unsafe file or network
   handling, missing authorization checks
3. Interactive components missing testID or accessibilityLabel. The automated
   UI gate addresses elements by those two props and cannot see anything that
   lacks them.

Report ONLY specific, real problems you can point at. No style opinions, no
praise, no summary of what the code does. One finding per line, formatted:
- <file>: <the problem> -> <the fix>

If there is nothing worth reporting, output exactly: CLEAN

Diff:
$DIFF"

OUTPUT=$(claude -p "$PROMPT" \
           --model "$VERIFY_MODEL" \
           --permission-mode plan \
           --allowedTools "Read,Grep,Glob" \
           --max-budget-usd "$VERIFY_BUDGET" 2>/dev/null)

# Mark this point reviewed regardless of outcome, so the next pass does not
# re-review the same commits
git rev-parse HEAD > "$LAST_REF_FILE" 2>/dev/null

if [ -z "$OUTPUT" ]; then
  echo "solyd-verify: no response from claude" >&2
  exit 0
fi

# Clean reviews stay silent so the loop only speaks up when it matters
echo "$OUTPUT" | grep -qx "CLEAN" && exit 0
echo "$OUTPUT"
EOF'
sudo chmod +x /usr/local/bin/solyd-verify

if provision_agent_tooling; then
  echo "✅ agent-device, Claude Code and EAS CLI installed."
else
  echo "⚠️ Agent UI tooling install failed — ralph falls back to the plain"
  echo "   'npm test' gate, exactly as before. Retry with:"
  echo "   sudo npm install -g agent-device @anthropic-ai/claude-code eas-cli"
fi

# ------------------------------------------------------------------------------
# Expo project scaffold: the flow scripts the ralph gate looks for, plus a PRD
# that teaches the agent the accessibility contract from its first commit.
# ------------------------------------------------------------------------------
SCAFFOLD=~/AI-Workspace/templates/expo-app
mkdir -p "$SCAFFOLD/.solyd/flows"

# --- Loop 1: web UI gate ------------------------------------------------------
cat << 'EOF' > "$SCAFFOLD/.solyd/flows/web.sh"
#!/bin/bash
# Loop 1 - web UI gate.
#
# Boots the Expo web build, reads the accessibility tree via agent-device, and
# fails if any label listed in .solyd/expected-web.txt is missing from it.
#
# This is what enforces the testID/accessibilityLabel contract: an element
# without them never appears in the tree, so the gate catches it at runtime -
# a stronger check than any lint rule, because it proves the label actually
# reaches the accessibility layer.

PORT="${EXPO_WEB_PORT:-8081}"
EXPECTED=".solyd/expected-web.txt"
EXPO_LOG=".solyd/expo-web.log"

if [ ! -f "$EXPECTED" ]; then
  echo "No $EXPECTED - nothing to assert yet, skipping web gate."
  exit 0
fi

EXPO_PID=""
cleanup() {
  agent-device close > /dev/null 2>&1
  [ -n "$EXPO_PID" ] && kill "$EXPO_PID" 2> /dev/null
  # Expo spawns children; take the process group with it
  [ -n "$EXPO_PID" ] && pkill -P "$EXPO_PID" 2> /dev/null
  return 0
}
trap cleanup EXIT

echo "Starting Expo web on port $PORT..."
npx expo start --web --port "$PORT" > "$EXPO_LOG" 2>&1 &
EXPO_PID=$!
# Drop it from the jobs table so shutting it down does not print "Terminated"
# into the gate output the agent has to read
disown "$EXPO_PID" 2> /dev/null || true

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

exit $STATUS
EOF

# --- Loop 2: android UI gate --------------------------------------------------
cat << 'EOF' > "$SCAFFOLD/.solyd/flows/android.sh"
#!/bin/bash
# Loop 2 - Android native UI gate.
#
# Same contract as web.sh, against the real React Native runtime on the
# emulator. Inert until you record the installed app id, because installing a
# dev build is far slower than the web loop and is not worth doing every
# iteration:
#
#   echo com.yourorg.yourapp > .solyd/android-app-id

APP_ID_FILE=".solyd/android-app-id"
EXPECTED=".solyd/expected-android.txt"

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
EOF

chmod +x "$SCAFFOLD/.solyd/flows/web.sh" "$SCAFFOLD/.solyd/flows/android.sh"

cat << 'EOF' > "$SCAFFOLD/.solyd/expected-web.txt"
# Accessibility labels that must be present in the running app.
# One per line; lines starting with # are ignored.
#
# The agent maintains this file: every time it builds a screen, it adds the
# accessibilityLabel of each element a user must be able to reach. The web gate
# fails if any of them is missing from the accessibility tree, which catches
# both "the screen did not render" and "the element has no label".
EOF

cat << 'EOF' > "$SCAFFOLD/PRD.md"
# Project Specification (PRD)

## Objective
- Define the main goal of this app.

## UI Contract (non-negotiable)

The automated gate drives this app through its **accessibility tree**, not
screenshots. It can only see elements that expose themselves properly.

- Every interactive element MUST have both `testID` and `accessibilityLabel`.
- Anything without them is invisible to the gate and counts as not built.
- When you add an element a user must reach, append its `accessibilityLabel`
  to `.solyd/expected-web.txt` in the same commit.
- Never delete entries from that file to make the gate pass.

```tsx
<Pressable
  testID="login-submit"
  accessibilityLabel="Sign in"
  onPress={handleSubmit}
>
  <Text>Sign in</Text>
</Pressable>
```

## Task Backlog
- [ ] Task 1: Scaffold navigation and the first screen.
- [ ] Task 2: Add accessibility labels and populate .solyd/expected-web.txt.
- [ ] Task 3: Implement core functionality.
EOF

# --- One-shot project creator -------------------------------------------------
sudo bash -c 'cat << "EOF" > /usr/local/bin/solyd-new-expo-app
#!/bin/bash
# Create an Expo app pre-wired for the ralph UI feedback loop.
#   solyd-new-expo-app my-app
set -e

NAME="$1"
if [ -z "$NAME" ]; then
  echo "Usage: solyd-new-expo-app <app-name>"
  exit 1
fi

TARGET="$HOME/Projects/apps/$NAME"
if [ -e "$TARGET" ]; then
  echo "❌ $TARGET already exists."
  exit 1
fi

echo "📱 Creating Expo app at $TARGET..."
mkdir -p "$HOME/Projects/apps"
cd "$HOME/Projects/apps"
npx --yes create-expo-app@latest "$NAME"

cd "$TARGET"
cp -rn "$HOME/AI-Workspace/templates/expo-app/." . 2>/dev/null || true
chmod +x .solyd/flows/*.sh 2>/dev/null || true
touch progress.txt

# react-native-web is what makes the fast web feedback loop possible
npx --yes expo install react-dom react-native-web @expo/metro-runtime

[ -d .git ] || git init -q .
git add -A
git -c user.name="AI Developer" -c user.email="ai@localhost" \
    commit -qm "chore: scaffold expo app with ralph UI feedback loop" || true

echo ""
echo "✅ Ready. Next:"
echo "   cd $TARGET"
echo "   ralph"
EOF'
sudo chmod +x /usr/local/bin/solyd-new-expo-app

# ------------------------------------------------------------------------------
# iOS runner configuration (Loop 3). Defaults to 'none' — web and Android
# feedback work with no Apple hardware at all. Flip the mode when a runner
# exists; nothing else in the pipeline needs to change.
# ------------------------------------------------------------------------------
mkdir -p ~/.config/solyd
if [ ! -f ~/.config/solyd/ios-runner.env ]; then
  cat << 'EOF' > ~/.config/solyd/ios-runner.env
# iOS feedback runner for the ralph gate (Loop 3).
#
#   none    no iOS surface; web + Android only            <- default
#   mac     Apple Silicon Mac over SSH (baguette + agent-device)
#   device  physical iPhone on USB via go-ios + WebDriverAgent
#   vm      local Docker-OSX — BUILDS ONLY, never the UI loop
#
# Why iOS is not local: the iOS Simulator is macOS-only, headless mode still
# renders (it just hides the window), and a QEMU macOS VM has no Metal. See
# the plan for the full reasoning.

IOS_RUNNER_MODE=none

# Used when IOS_RUNNER_MODE=mac
IOS_RUNNER_HOST=""
IOS_RUNNER_USER=""
IOS_RUNNER_KEY="$HOME/.ssh/id_ed25519"
EOF
  echo "📱 iOS runner stubbed at ~/.config/solyd/ios-runner.env (mode: none)."
fi

# ==============================================================================
# MISSING FIXES PATCH
# ==============================================================================

echo "🔧 [12/12] Applying Pro-Mode System Patches..."

# 1. Fix React Native / Expo File Watcher Limit (ENOSPC fix)
echo "fs.inotify.max_user_watches=524288" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# 2. Enable Ollama Flash Attention for RTX 3060 VRAM Efficiency
sudo mkdir -p /etc/systemd/system/ollama.service.d
echo -e "[Service]\nEnvironment=\"OLLAMA_FLASH_ATTENTION=1\"" | sudo tee /etc/systemd/system/ollama.service.d/override.conf
sudo systemctl daemon-reload
sudo systemctl restart ollama

# 3. Inject Android SDK Paths into Bash
if ! grep -q "ANDROID_HOME" ~/.bashrc 2>/dev/null; then
cat << 'EOF' >> ~/.bashrc

# Android Studio & Expo Dev Paths
export ANDROID_HOME=$HOME/Android/Sdk
export ANDROID_SDK_ROOT=$ANDROID_HOME
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin
EOF
fi

# 4. Initialize Git Identity for Aider Auto-Commits
# (Checks if unset, and assigns a default bot identity if missing)
if ! git config --global user.name > /dev/null; then
  git config --global user.name "AI Developer"
  git config --global user.email "ai@localhost"
fi

# 5. Persist the Anthropic API key captured in step 0
if [ -n "$CFG_ANTHROPIC_KEY" ]; then
  if grep -q "ANTHROPIC_API_KEY" ~/.bashrc 2>/dev/null; then
    echo "ℹ️ ANTHROPIC_API_KEY already present in ~/.bashrc — leaving it alone."
  else
    {
      echo ""
      echo "# Anthropic API Key for Hybrid Aider / Ralph Loop"
      echo "export ANTHROPIC_API_KEY=\"$CFG_ANTHROPIC_KEY\""
    } >> ~/.bashrc
    echo "✅ ANTHROPIC_API_KEY saved to ~/.bashrc"
  fi
else
  echo "⚠️ No Anthropic key set. Export ANTHROPIC_API_KEY before running 'ralph'."
fi

echo ""
echo "=========================================================================="
echo "🎉 SETUP COMPLETE!"
echo "=========================================================================="
echo "Important Next Steps:"
echo "1. Reboot your PC to apply NVIDIA driver and group permissions:"
echo "   sudo reboot"
echo ""
echo "2. Connect remotely from macOS:"
echo "   - Terminal (SSH): ssh $USER@<ubuntu-ip>"
echo "   - Remote Desktop (GUI): Use 'Windows App' / 'Microsoft Remote Desktop'"
echo "     from the Mac App Store and connect to <ubuntu-ip>"
echo "$RDP_SUMMARY"
echo "     RDP user: $RDP_USER"
if [ -n "$RDP_PASS_GENERATED" ]; then
  echo "     RDP password (auto-generated, save it now): $RDP_PASS"
fi
echo "     The certificate is self-signed — accept the warning on first connect."
echo ""
echo "3. How to run an automated AI loop in ANY folder:"
echo "   cd ~/Projects/apps/my-app"
echo "   git init"
echo "   ralph"
echo ""
if [ -n "$TELEGRAM_READY" ]; then
  echo "4. Telegram reporting is ACTIVE:"
  echo "   - ralph messages you when a run finishes, stalls, or trips the breaker"
  echo "   - Daily digest arrives at 20:00 (systemd --user timer)"
  echo "   - Preview it now:  solyd-daily-report --stdout"
  echo "   - Send it now:     solyd-daily-report"
  echo "   - Change the time: systemctl --user edit solyd-daily-report.timer"
else
  echo "4. To enable Telegram reporting later:"
  echo "   Put TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in"
  echo "   ~/.config/solyd/telegram.env (chmod 600), then test with:"
  echo "   solyd-notify \"hello\" && systemctl --user enable --now solyd-daily-report.timer"
fi
echo ""
echo "5. Android is preconfigured — no setup wizard:"
echo "   - SDK at $ANDROID_HOME (API ${API_LEVEL:-?}, platform-tools, build-tools)"
echo "   - Emulator AVD 'solyd_pixel' — start it with: emulator -avd solyd_pixel"
echo "   - Android Studio will detect this SDK on first launch"
echo "   - Reboot first: the emulator needs your new 'kvm' group membership"
echo ""
echo "6. Expo apps with an agent UI feedback loop:"
echo "   solyd-new-expo-app my-app     # scaffolds + wires the gate"
echo "   cd ~/Projects/apps/my-app && ralph"
echo "   - The gate reads the ACCESSIBILITY TREE, not screenshots, so every"
echo "     interactive element needs testID + accessibilityLabel to be seen"
echo "   - List required labels in .solyd/expected-web.txt; the gate fails"
echo "     the iteration if any of them is missing from the running app"
echo "   - Claude Code reviews the diff every 5 iterations and on failure"
echo "   - iOS is stubbed at ~/.config/solyd/ios-runner.env (mode: none);"
echo "     iOS simulators need Apple hardware, see the plan for why"
echo "=========================================================================="
