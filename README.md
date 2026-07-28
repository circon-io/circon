# solyd-machine

One script that turns a fresh Ubuntu install into an autonomous AI development
machine — an agent that picks tasks off a spec, writes code, verifies it against
a running app, commits what passes, and messages you when it's done.

## Quick start

```bash
git clone https://github.com/<you>/solyd-machine.git
cd solyd-machine
./init.sh
```

It asks three questions up front — Anthropic API key, remote desktop
credentials, Telegram bot token — then runs unattended for roughly 30 minutes.
Reboot afterwards to pick up the NVIDIA driver and the `kvm`/`docker` group
memberships.

## What it installs

| | |
|---|---|
| **AI** | Ollama + `qwen2.5-coder:7b`, aider, Claude Code, the `ralph` autonomous loop |
| **GPU** | NVIDIA drivers, CUDA toolkit, Ollama flash attention |
| **Mobile** | Node LTS, Expo, Android Studio, headless Android SDK + a ready emulator |
| **Containers** | Docker Engine, KVM for hardware-accelerated emulation |
| **Remote** | OpenSSH, GNOME Remote Desktop (native RDP, works from the login screen) |
| **Reporting** | Telegram notifications and a daily digest |

Android is fully provisioned headlessly — no setup wizard, no manual SDK
downloads. An AVD named `solyd_pixel` is ready to boot after reboot.

## The autonomous loop

Write a `PRD.md` with a task backlog, then:

```bash
cd ~/Projects/apps/my-app
git init
ralph                 # or: ralph 50   to raise the iteration cap
```

Each iteration aider implements exactly one task, the quality gate runs, and the
change is committed or reverted. Commits are named after the task that was
completed, so `git log` reads as a record of what got built. Three consecutive
failures trip a circuit breaker rather than burning the budget.

`ralph` messages you on Telegram when it finishes, stalls, or trips — including
what it built, the agent's own progress notes, and the failing output.

## Expo apps with UI feedback

```bash
solyd-new-expo-app my-app
cd ~/Projects/apps/my-app
ralph
```

The gate drives the running app through its **accessibility tree**, not
screenshots, so the agent can actually check what it rendered and act on it.
That imposes one rule: every interactive element needs both `testID` and
`accessibilityLabel`, or it's invisible to the gate. List the labels a screen
must expose in `.solyd/expected-web.txt` and the gate fails any iteration where
one goes missing — which catches both "the element has no label" and "the screen
rendered nothing".

The gate is tiered and entirely opt-in by file presence — typecheck, unit tests,
then web and Android UI. Projects without those files behave like a plain
`npm test` run.

Every 5 iterations and on any failure, Claude Code reviews the accumulated diff
for correctness and security; findings go to Telegram and into the agent's next
prompt.

**iOS**: the simulator is macOS-only, so it's stubbed at
`~/.config/solyd/ios-runner.env` (`IOS_RUNNER_MODE=none`). Web and Android
feedback need no Apple hardware. See [CLAUDE.md](CLAUDE.md) for why the obvious
workarounds don't work.

## Commands

| Command | Description |
|---|---|
| `ralph [max_loops]` | Run the autonomous loop in the current git repo |
| `solyd-new-expo-app <name>` | Scaffold an Expo app wired to the UI gate |
| `solyd-daily-report [--stdout]` | Send or preview the daily digest |
| `solyd-notify "message"` | Send a Telegram message |
| `solyd-verify [reason]` | Run a Claude Code review of the recent diff |

## Remote access from macOS

```bash
ssh <user>@<ubuntu-ip>
```

For the desktop, use **Windows App** (formerly Microsoft Remote Desktop) from
the Mac App Store. Port 3389 reaches the login screen from a cold boot — no
automatic login needed, so the machine stays locked when unattended. Port 3390
attaches to an already-running session.

## Configuration

| Path | Purpose |
|---|---|
| `~/.config/solyd/telegram.env` | Bot token and chat ID (mode 600) |
| `~/.config/solyd/ios-runner.env` | iOS runner mode and host |
| `~/AI-Workspace/templates/` | PRD template and the Expo scaffold |
| `~/.local/state/ralph/` | Per-run logs |

Change the digest time with `systemctl --user edit solyd-daily-report.timer`.

## Requirements

Ubuntu 24.04+ (GNOME 46+ for login-screen RDP), an NVIDIA GPU, and enough disk
for the Android SDK and CUDA. Developed against an RTX 3060.
