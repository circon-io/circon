#!/bin/bash
# ==============================================================================
# Autonomous AI Development Machine Setup Script for Fresh Ubuntu Installation
# ==============================================================================
# Installs:
# - NVIDIA Drivers & CUDA Toolkit
# - KVM (Hardware Acceleration) + OpenSSH & xrdp (Remote Access from macOS)
# - Docker Engine (Non-root user configuration)
# - Node.js LTS, pnpm, yarn, Expo CLI, JDK 17, Android Studio
# - Python 3, Pip, Pipx, Aider
# - Ollama + qwen2.5-coder:7b Model
# - Directory Hierarchy (~/Projects, ~/AI-Workspace)
# - Global 'ralph' Autonomous Harness Command in /usr/local/bin/
# ==============================================================================

set -e

echo "🚀 Starting Full AI & Software Development Environment Setup..."

# 1. System Updates & Essential Utilities
echo "📦 [1/9] Updating System & Installing Essential Tools..."
sudo apt update && sudo apt upgrade -y
sudo apt install -y \
  curl wget git build-essential unzip jq tmux screen htop \
  software-properties-common ca-certificates gnupg \
  openssh-server xrdp openjdk-17-jdk

# Enable SSH and RDP for remote management from macOS
sudo systemctl enable --now ssh
sudo systemctl enable --now xrdp
sudo usermod -aG ssl-cert $USER

# 2. NVIDIA Drivers & CUDA Setup
echo "🟢 [2/9] Auto-detecting & Installing NVIDIA Drivers & CUDA..."
sudo ubuntu-drivers install
sudo apt install -y nvidia-cuda-toolkit

# 3. KVM / Virtualization (For Android Emulator Acceleration)
echo "⚡ [3/9] Setting up KVM for Android Emulation..."
sudo apt install -y qemu-system libvirt-daemon-system libvirt-clients bridge-utils virt-manager
sudo usermod -aG kvm $USER
sudo usermod -aG libvirt $USER

# 4. Docker Engine Setup
echo "🐳 [4/9] Installing Docker Engine..."
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com -o get-docker.sh
  sudo sh get-docker.sh
  rm get-docker.sh
fi
sudo usermod -aG docker $USER

# 5. Node.js (LTS), Package Managers & Android Studio
echo "🟢 [5/9] Installing Node.js LTS, pnpm, Expo CLI, and Android Studio..."
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g npm@latest pnpm yarn expo-cli

# Install Android Studio cleanly via Snap
sudo snap install android-studio --classic

# 6. Python Tooling & Aider
echo "🐍 [6/9] Installing UV, and Aider..."
curl -LsSf https://astral.sh/uv/install.sh | sh
uv tool install --python 3.12 aider-chat
uv tool update-shell

# 7. Ollama & Qwen Coder Model Setup
echo "🦙 [7/9] Installing Ollama & Pulling qwen2.5-coder:7b..."
curl -fsSL https://ollama.com/install.sh | sh
sudo systemctl enable --now ollama
sleep 5
ollama pull qwen2.5-coder:7b

# 8. Directory Structure & Global 'ralph' Harness
echo "📁 [8/9] Creating Project Workspace & Global 'ralph' Harness..."

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

echo "🚀 Starting Hybrid Ralph Loop (Max Iterations: $MAX_LOOPS)..."
echo "🧠 Architect: $ARCHITECT_MODEL"
echo "✍️  Editor:   $EDITOR_MODEL"

for ((i=1; i<=MAX_LOOPS; i++)); do
  echo ""
  echo "=================================================="
  echo "🔁 Loop Iteration #$i of $MAX_LOOPS"
  echo "=================================================="

  PROMPT="Pick the SINGLE highest-priority incomplete task from PRD.md. Implement ONLY that task. Update PRD.md and progress.txt with your changes. If all tasks are finished, append '\''ALL_TASKS_COMPLETE'\'' to progress.txt."

  # Execute Aider in Hybrid Architect Mode
  "$AIDER_BIN" PRD.md progress.txt \
        --architect \
        --model "$ARCHITECT_MODEL" \
        --editor-model "$EDITOR_MODEL" \
        --message "$PROMPT" \
        --yes-always \
        --no-auto-commits

  echo "🧪 Running Backpressure Quality Gate..."

  TEST_CMD="npm test"
  if [ ! -f "package.json" ]; then
    TEST_CMD="true" # Pass automatically if no package.json exists yet
  fi

  if eval "$TEST_CMD"; then
    echo "✅ Tests passed!"
    git add .

    if ! git diff --cached --quiet; then
      git commit -m "ralph(iter-$i): completed automated task"
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
      exit 1
    fi
  fi

  if grep -q "ALL_TASKS_COMPLETE" progress.txt 2>/dev/null; then
    echo "🎉 All tasks in PRD.md are completed! Exiting Ralph Loop successfully."
    break
  fi

done
EOF'

sudo chmod +x /usr/local/bin/ralph

# ==============================================================================
# MISSING FIXES PATCH
# ==============================================================================

echo "🔧 [9/9] Applying Pro-Mode System Patches..."

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

# ==============================================================================
# INTERACTIVE ANTHROPIC API KEY SETUP
# ==============================================================================

echo ""
echo "🔑 [Optional] Anthropic API Key Configuration"
echo "Hybrid mode requires an Anthropic API key for the Architect (Sonnet) phase."
read -p "Do you want to enter your Anthropic API key now? (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  read -sp "Paste your API key (input will be hidden): " USER_API_KEY
  echo ""

  if [ -n "$USER_API_KEY" ]; then
    # Append to ~/.bashrc safely
    echo "" >> ~/.bashrc
    echo "# Anthropic API Key for Hybrid Aider / Ralph Loop" >> ~/.bashrc
    echo "export ANTHROPIC_API_KEY=\"$USER_API_KEY\"" >> ~/.bashrc
    echo "✅ ANTHROPIC_API_KEY successfully saved to ~/.bashrc!"
  else
    echo "⚠️ Empty key provided. Skipping for now."
  fi
else
  echo "⚠️ Skipped. Remember to export ANTHROPIC_API_KEY before running 'ralph'."
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
echo "   - Remote Desktop (GUI): Use 'Microsoft Remote Desktop' from Mac App Store to connect to <ubuntu-ip>"
echo ""
echo "3. How to run an automated AI loop in ANY folder:"
echo "   cd ~/Projects/apps/my-app"
echo "   git init"
echo "   ralph"
echo "=========================================================================="
