#!/bin/bash
# ==============================================================================
# circon bootstrap — Ubuntu or macOS
# ==============================================================================
# This script does the smallest possible job: get Node and the circon CLI onto a
# fresh machine. Everything after that is the CLI's responsibility.
#
#   circon config    credentials, asked once
#   circon setup     install whatever is missing — safe to re-run
#   circon doctor    what is installed, missing, stale or foreign
#
# The provisioning logic that used to live here now lives in TypeScript, where
# it can be re-run without crashing, updated with `npm update -g @circon/cli`,
# and unit tested. See CLAUDE.md for why.
# ==============================================================================

set -euo pipefail

NODE_MAJOR=24
CLI_PACKAGE="${CIRCON_CLI_PACKAGE:-@circon/cli}"

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }

OS="$(uname -s)"
case "$OS" in
  Linux|Darwin) ;;
  *) die "This bootstrap targets Ubuntu and macOS. Elsewhere install the CLI directly: npm i -g $CLI_PACKAGE" ;;
esac
[ "$(id -u)" -ne 0 ] || die "Run this as your normal user, not root. It will ask for sudo when needed."

say "circon bootstrap"
echo "Installing only Node and the CLI; 'circon setup' does the rest."

# --- 1. Enough to fetch anything else -----------------------------------------
say "[1/3] Base packages"
if [ "$OS" = "Darwin" ]; then
  # Homebrew is where everything else on a Mac runner comes from.
  if ! command -v brew > /dev/null 2>&1; then
    NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    eval "$(/opt/homebrew/bin/brew shellenv 2>/dev/null || /usr/local/bin/brew shellenv)"
  fi
  ok "Homebrew $(brew --version | head -1 | cut -d' ' -f2) present"
else
  sudo apt-get update -qq
  sudo apt-get install -y -qq curl ca-certificates gnupg git
  ok "curl, git and certificates present"
fi

# --- 2. Node --------------------------------------------------------------
# Adopt an existing install when it is new enough. A version manager (nvm, fnm,
# volta) putting Node on PATH must not be shadowed by a NodeSource apt package,
# or the machine ends up with two Nodes and behavior that depends on shell
# startup order.
say "[2/3] Node.js"
CURRENT_NODE=""
if command -v node > /dev/null 2>&1; then
  CURRENT_NODE="$(node --version | sed 's/^v//')"
fi

if [ -n "$CURRENT_NODE" ] && [ "${CURRENT_NODE%%.*}" -ge 22 ]; then
  ok "Node v$CURRENT_NODE already present — leaving it alone"
else
  if [ -n "$CURRENT_NODE" ]; then
    warn "Node v$CURRENT_NODE is too old (need 22.12+); installing ${NODE_MAJOR}.x"
  fi
  if [ "$OS" = "Darwin" ]; then
    brew install "node@${NODE_MAJOR}" && brew link --overwrite --force "node@${NODE_MAJOR}"
  else
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
    sudo apt-get install -y nodejs
  fi
  ok "Node $(node --version) installed"
fi

# --- 3. The CLI ---------------------------------------------------------------
say "[3/3] circon CLI"
# Homebrew's npm owns its global prefix; NodeSource's needs root.
NPM="sudo npm"
[ "$OS" = "Darwin" ] && NPM="npm"
WAS_INSTALLED=0
command -v circon > /dev/null 2>&1 && WAS_INSTALLED=1
$NPM install -g "$CLI_PACKAGE" > /dev/null
if [ "$WAS_INSTALLED" -eq 1 ]; then
  ok "circon updated to $(circon --version)"
else
  ok "circon $(circon --version) installed"
fi

cat <<'NEXT'

──────────────────────────────────────────────────────────────────────────
Bootstrap complete. Two commands to a working machine:

  circon config     agent credentials, conventions repository
  circon setup      install everything missing (~30 min on a fresh box)

Then, any time:

  circon doctor     what is installed, missing, stale or foreign
  circon setup      re-run freely — it only installs what is absent
  circon init       scaffold a project
  circon run        drive the agent loop

On Linux, reboot after the first setup for the kvm and docker groups.
On macOS, install Xcode from the App Store for iOS testing.
──────────────────────────────────────────────────────────────────────────
NEXT
