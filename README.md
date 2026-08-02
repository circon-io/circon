# circon

One script that turns a fresh Ubuntu install into an autonomous AI development
machine — an agent that picks tasks off a spec, writes code, verifies it against
a running app, commits what passes, and messages you when it's done.

## Quick start

```bash
curl -fsSL https://raw.githubusercontent.com/circon-io/circon/main/init.sh | bash
```

The bootstrap installs Node and the CLI, nothing more. Two commands finish the job:

```bash
circon config     # Anthropic key, Telegram bot, conventions repo — asked once
circon setup      # install everything missing (~30 min on a fresh box)
```

Reboot afterwards to pick up the NVIDIA driver and the `kvm`/`docker` groups.

**`circon setup` is safe to re-run.** It probes the real system and installs only
what is absent — no duplicate config lines, no re-downloading the model. Update
the runtime any time with `npm update -g @circon/cli`; no reprovisioning.

## What it installs

| | |
|---|---|
| **AI** | Ollama + `qwen2.5-coder:7b`, aider, Claude Code, the `circon` autonomous loop |
| **GPU** | NVIDIA drivers, CUDA toolkit, Ollama flash attention |
| **Mobile** | Node LTS, Expo, Android Studio, headless Android SDK + a ready emulator |
| **Containers** | Docker Engine, KVM for hardware-accelerated emulation |
| **Remote** | OpenSSH, GNOME Remote Desktop (native RDP, works from the login screen) |
| **Reporting** | Telegram notifications and a daily digest |

Android is fully provisioned headlessly — no setup wizard, no manual SDK
downloads. An AVD named `circon_pixel` is ready to boot after reboot.

## Project layout

`~/Projects` holds one directory per project — nothing else. Each project is a
pnpm monorepo containing its own clients and services, so there's no top-level
split by artifact type to fight:

```
~/Projects/my-thing/
  PRD.md              # the backlog the agent works through
  progress.txt        # the agent's running notes
  .circon/            # gate flows and expected accessibility labels
  apps/mobile/        # Expo client
  services/api/       # backend, started automatically by the UI gate
  packages/shared/    # types and code shared between them
```

`circon run` works at the project root, next to `PRD.md`. The agent commits to
`circon/work`, so your PRD edits on `main` never collide with its output.

## Shared engineering conventions

`~/AI-Workspace/conventions/ARCHITECTURE.md` holds the standards that apply to **every**
project — monorepo boundaries, the accessibility contract, TypeScript rules, API
conventions, and the rule that a failing check is never to be weakened to make
it pass. It's one file, referenced rather than copied, so editing it changes
every project's next iteration.

It reaches the agents three ways:

- `circon run` passes it to aider with `--read`, so it's read-only and prompt-cached
  rather than re-paid for each iteration
- `circon verify` appends it to Claude Code's system prompt, so the reviewer
  holds code to the same standard
- Each project's `CLAUDE.md` imports it with `@~/AI-Workspace/conventions/ARCHITECTURE.md`
  for interactive sessions

A project can add `.circon/ARCHITECTURE.md` to extend it locally; both are loaded,
project last.

The split is deliberate: **`PRD.md` says what to build, `ARCHITECTURE.md` says
how.** Keep standards out of PRDs so they don't drift between projects.

## The autonomous loop

Write a `PRD.md` with a task backlog, then:

```bash
cd ~/Projects/my-thing
circon run            # or: circon run 50   to raise the iteration cap
```

Each iteration aider implements exactly one task, the quality gate runs, and the
change is committed or reverted. Commits are named after the task that was
completed, so `git log` reads as a record of what got built. Three consecutive
failures trip a circuit breaker rather than burning the budget.

`circon` messages you on Telegram when it finishes, stalls, or trips — including
what it built, the agent's own progress notes, and the failing output.

## Full-stack projects with UI feedback

```bash
circon init my-thing              # monorepo + optional Expo client + gate
cd ~/Projects/my-thing
circon run
```

`circon init` asks whether to add the Expo client. The gate starts
`services/api` before the client, so the accessibility tree reflects a working
app rather than an error state.

The gate drives the running app through its **accessibility tree**, not
screenshots, so the agent can actually check what it rendered and act on it.
That imposes one rule: every interactive element needs both `testID` and
`accessibilityLabel`, or it's invisible to the gate. List the labels a screen
must expose in `.circon/expected-web.txt` and the gate fails any iteration where
one goes missing — which catches both "the element has no label" and "the screen
rendered nothing".

The gate is tiered and entirely opt-in by file presence — typecheck, unit tests,
then web and Android UI. Projects without those files behave like a plain
`npm test` run.

Every 5 iterations and on any failure, Claude Code reviews the accumulated diff
for correctness and security; findings go to Telegram and into the agent's next
prompt.

**iOS**: the simulator is macOS-only, so it's stubbed at
`~/.config/circon/config.json` (`IOS_RUNNER_MODE=none`). Web and Android
feedback need no Apple hardware. See [CLAUDE.md](CLAUDE.md) for why the obvious
workarounds don't work.

## Commands

| Command | Description |
|---|---|
| `circon doctor` | What is installed, missing, stale or foreign |
| `circon setup [--upgrade]` | Converge the machine; only installs what is absent |
| `circon config` | Set credentials |
| `circon init [name]` | Scaffold a pnpm monorepo wired to the UI gate |
| `circon run [maxLoops]` | Run the autonomous loop in the current project |
| `circon stop` | Stop the loop cleanly, between iterations |
| `circon verify [reason]` | Claude Code review of the recent diff |
| `circon report [--stdout]` | Send or preview the daily digest |
| `circon listen` | Telegram control daemon (Stop / Status / Last log) |
| `circon update` | Pull the shared conventions repository |

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
| `~/.config/circon/telegram.env` | Bot token and chat ID (mode 600) |
| `~/.config/circon/config.json` | iOS runner mode and host |
| `~/AI-Workspace/conventions/` | Shared engineering conventions (a git clone) |

| `~/.local/state/circon/` | Per-run logs and the run lock |

Change the digest time with `systemctl --user edit circon-report.timer`.

## Requirements

Ubuntu 24.04+ (GNOME 46+ for login-screen RDP), an NVIDIA GPU, and enough disk
for the Android SDK and CUDA. Developed against an RTX 3060.
