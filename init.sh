#!/bin/bash
# ==============================================================================
# Autonomous AI Development Machine Setup Script for Fresh Ubuntu Installation
# ==============================================================================
# Installs:
# - NVIDIA Drivers & CUDA Toolkit
# - KVM (Hardware Acceleration) + OpenSSH & GNOME Remote Desktop (RDP from macOS)
# - Docker Engine (Non-root user configuration)
# - Node.js LTS, pnpm, yarn, Expo CLI, JDK 17, Android Studio
# - Python 3, Pip, Pipx, Aider
# - Ollama + qwen2.5-coder:7b Model
# - Directory Hierarchy (~/Projects, ~/AI-Workspace)
# - Global 'ralph' Autonomous Harness Command in /usr/local/bin/
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
echo "📦 [1/11] Updating System & Installing Essential Tools..."
sudo apt update && sudo apt upgrade -y
sudo apt install -y \
  curl wget git build-essential unzip jq tmux screen htop \
  software-properties-common ca-certificates gnupg openssl \
  openssh-server gnome-remote-desktop openjdk-17-jdk

# Enable SSH for remote management from macOS (RDP is configured in step 9)
sudo systemctl enable --now ssh

# 2. NVIDIA Drivers & CUDA Setup
echo "🟢 [2/11] Auto-detecting & Installing NVIDIA Drivers & CUDA..."
sudo ubuntu-drivers install
sudo apt install -y nvidia-cuda-toolkit

# 3. KVM / Virtualization (For Android Emulator Acceleration)
echo "⚡ [3/11] Setting up KVM for Android Emulation..."
sudo apt install -y qemu-system libvirt-daemon-system libvirt-clients bridge-utils virt-manager
sudo usermod -aG kvm $USER
sudo usermod -aG libvirt $USER

# 4. Docker Engine Setup
echo "🐳 [4/11] Installing Docker Engine..."
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com -o get-docker.sh
  sudo sh get-docker.sh
  rm get-docker.sh
fi
sudo usermod -aG docker $USER

# 5. Node.js (LTS), Package Managers & Android Studio
echo "🟢 [5/11] Installing Node.js LTS, pnpm, Expo CLI, and Android Studio..."
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g npm@latest pnpm yarn expo-cli

# Install Android Studio cleanly via Snap
sudo snap install android-studio --classic

# 6. Python Tooling & Aider
echo "🐍 [6/11] Installing UV, and Aider..."
curl -LsSf https://astral.sh/uv/install.sh | sh
uv tool install --python 3.12 aider-chat
uv tool update-shell

# 7. Ollama & Qwen Coder Model Setup
echo "🦙 [7/11] Installing Ollama & Pulling qwen2.5-coder:7b..."
curl -fsSL https://ollama.com/install.sh | sh
sudo systemctl enable --now ollama
sleep 5
ollama pull qwen2.5-coder:7b

# 8. Directory Structure & Global 'ralph' Harness
echo "📁 [8/11] Creating Project Workspace & Global 'ralph' Harness..."

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

  PROMPT="Pick the SINGLE highest-priority incomplete task from PRD.md. Implement ONLY that task. Update PRD.md and progress.txt with your changes. If all tasks are finished, append '\''ALL_TASKS_COMPLETE'\'' to progress.txt."

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

  TEST_CMD="npm test"
  if [ ! -f "package.json" ]; then
    TEST_CMD="true" # Pass automatically if no package.json exists yet
  fi

  # Run to a file so the exit code survives and the output can be quoted in
  # the failure alert
  eval "$TEST_CMD" > "$TEST_LOG" 2>&1
  TEST_STATUS=$?
  cat "$TEST_LOG"
  cat "$TEST_LOG" >> "$RUN_LOG"

  if [ $TEST_STATUS -eq 0 ]; then
    echo "✅ Tests passed!"
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
    echo "❌ Tests failed! Reverting bad iteration code..."
    git reset --hard HEAD
    git clean -fd

    ((STUCK_COUNT++))
    echo "⚠️ Failure count: $STUCK_COUNT/$STUCK_LIMIT"

    if [ $STUCK_COUNT -ge $STUCK_LIMIT ]; then
      echo "🛑 CIRCUIT BREAKER TRIGGERED: Agent failed $STUCK_LIMIT consecutive times. Halting."
      notify "🛑 ralph HALTED: $PROJECT_NAME
Circuit breaker tripped after $STUCK_LIMIT consecutive test failures.
Stopped at iteration $i of $MAX_LOOPS after $(elapsed).

Completed before the failure ($COMMITS_MADE commits):
$(work_done)

Last agent notes:
$(new_notes)

Why it failed (tail of $TEST_CMD):
$(tail -n 12 "$TEST_LOG" 2>/dev/null)

Full log: $RUN_LOG"
      exit 1
    fi
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
echo "🖥️  [9/11] Configuring Ubuntu's Native Remote Desktop (RDP)..."

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
echo "📨 [10/11] Installing Telegram Notifier & Daily Report..."

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

# ==============================================================================
# MISSING FIXES PATCH
# ==============================================================================

echo "🔧 [11/11] Applying Pro-Mode System Patches..."

# 1. Fix React Native / Expo File Watcher Limit (ENOSPC fix)
echo "fs.inotify.max_user_watches=524288" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# 2. Enable Ollama Flash Attention for RTX 3060 VRAM Efficiency
sudo mkdir -p /etc/systemd/system/ollama.service.d
echo -e "[Service]\nEnvironment=\"OLLAMA_FLASH_ATTENTION=1\"" | sudo tee /etc/systemd/system/ollama.service.d/override.conf
sudo systemctl daemon-reload
sudo systemctl restart ollama

# 3. Inject Android SDK Paths into Bash
cat << 'EOF' >> ~/.bashrc

# Android Studio & Expo Dev Paths
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
EOF

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
echo "=========================================================================="
