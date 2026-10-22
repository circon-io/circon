# circon

Turns a machine you own into a runner that builds apps for you. You describe the
app, an AI plans it, and the runner builds, tests and ships it. It follows a
shared set of engineering conventions and has to pass a quality gate before
anything is committed.

Where this is going, and why: [VISION.md](VISION.md). What is left to build:
[TODO.md](TODO.md).

## Quick start

```bash
curl -fsSL https://raw.githubusercontent.com/circon-io/circon/main/init.sh | bash
```

The bootstrap installs Node and the CLI, and nothing else. Two more commands
finish the setup:

```bash
circon config     # agent credentials and the conventions repo, asked once
circon setup      # install everything missing (~30 min on a fresh box)
```

Reboot afterwards so the NVIDIA driver and the `kvm`/`docker` groups take effect.

**`circon setup` is safe to re-run.** It probes the real system and installs only
what is missing. It never adds duplicate config lines or downloads the model
again. You can update the runtime at any time with `npm update -g @circon/cli`,
without reprovisioning.

To take jobs from the dashboard, enroll the machine with the token the dashboard
shows you:

```bash
circon enroll --url https://api.circon.io --token <one-time token>
```

This installs `circon agent` as a user service. It keeps a connection to the
control plane open, reports heartbeats and live logs, and claims queued jobs.

## What it installs

| | |
|---|---|
| **AI** | Ollama + `qwen2.5-coder:7b`, aider, Claude Code (with the context7 MCP), OpenAI Codex |
| **GPU** | NVIDIA drivers, CUDA toolkit, Ollama flash attention |
| **Mobile** | Node 24, pnpm, Expo tooling, Android Studio, a headless Android SDK and a ready emulator |
| **Containers** | Docker Engine, plus KVM for hardware-accelerated emulation |
| **Remote** | OpenSSH |
| **Service** | `circon agent` as a systemd user service (launchd on a Mac) |

Android is provisioned headlessly, with no setup wizard and no manual SDK
downloads. An AVD named `circon_pixel` is created, and the gate boots it when it
needs a device.

## Project layout

A project is one GitHub repository. On a runner, each project is cloned to
`~/circon-projects/<owner>__<repo>`. A project made locally with `circon init`
lives in `~/Projects/<name>`. Either way, it is a pnpm monorepo:

```
PRD.md              # what to build, the task backlog (only humans edit this)
progress.txt        # the agent's running notes
.circon/            # gate flows, expected accessibility labels, task state
apps/mobile/        # Expo client
services/api/       # the backend, started automatically by the UI gate
packages/shared/    # types and code shared between them
```

Each run works on its own branch, `circon/run-<date>-<id>`, and ends in a pull
request. Task completion is recorded in `.circon/progress.json`, never in
`PRD.md`. That way your edits to the PRD on `main` never conflict with the
agent's work.

## Shared engineering conventions

`~/AI-Workspace/conventions/ARCHITECTURE.md` holds the standards that apply to
**every** project:
- the stack
- monorepo boundaries
- the accessibility contract
- TypeScript rules
- API conventions
- the rule that a failing check is never weakened to make it pass

The conventions repository is tagged. A runner uses the newest tag whose
`requires-cli` it satisfies, so a convention change can never ask for tooling the
machine does not have.

The conventions reach the agents in three ways:

- `circon run` passes them to aider with `--read`, so they are read-only and
  prompt-cached instead of paid for again each iteration.
- The review pass appends them to Claude Code's system prompt, so the reviewer
  holds the code to the same standard.
- Each project's `CLAUDE.md` imports them, for interactive sessions.

A project can extend them locally with `.circon/ARCHITECTURE.md`. Both files are
loaded, the project's last.

**`PRD.md` says what to build. `ARCHITECTURE.md` says how.** Keep standards out of
PRDs so they don't drift between projects.

## The autonomous loop

```bash
cd ~/Projects/my-thing
circon run            # or: circon run 50   to raise the iteration cap
```

Each iteration runs the same steps:
1. The agent implements exactly one open task from `PRD.md`, optionally after a
   separate planning step.
2. The quality gate runs.
3. If the gate passes, the change is committed. If it fails, the change is
   reverted.

Commits are named after the completed task.

Several limits stop a loop that isn't getting anywhere:
- Three consecutive gate failures trip a circuit breaker.
- Infrastructure failures (Ollama down, out of disk, an OOM) are retried with
  backoff and don't count toward the breaker.
- Spend caps per run and per day stop a loop mid-run, before they are exceeded.

The gate is tiered and runs cheapest first: typecheck → unit tests → web UI →
Android UI → iOS UI. Every tier is opt-in by file presence. A project without
those files behaves like a plain `npm test` run.

The UI tiers drive the running app through its **accessibility tree**, not
through screenshots. That means every interactive element needs both `testID`
and `accessibilityLabel`. List the labels a screen must expose in
`.circon/expected-web.txt`, and the gate fails any iteration where one is
missing.

Every 5 iterations, and after any failure, a reviewer looks over the accumulated
diff for correctness and security. Its findings go into the agent's next prompt.

### Agents and models per role

Planning, building and reviewing are separate roles. Each one can use a
different backend (`aider`, `claude-code` or `codex`) and a different model. You
set them per organization, runner or project in the dashboard, or in
`config.json`:

```json
{
  "agents": {
    "plan":   { "backend": "claude-code", "model": "fable" },
    "build":  { "backend": "claude-code", "model": "opus" },
    "review": { "backend": "codex" }
  }
}
```

With nothing set, aider builds (Sonnet as architect, local Qwen as editor) and
Claude Code reviews.

Claude Code and Codex can run on the subscriptions you already have (`claude
setup-token`, `codex login --device-auth`), and their usage is recorded but never
counted against your budget caps. When a subscription's usage window runs out,
the loop waits for the reset instead of failing. `circon doctor` shows whether
each agent can run, and who pays for it.

**iOS** is controlled by `iosRunnerMode` in `~/.config/circon/config.json`. Web
and Android feedback need no Apple hardware. [CLAUDE.md](CLAUDE.md) explains why
the iOS simulator can't run on Linux.

## Commands

| Command | Description |
|---|---|
| `circon doctor` | Show what is installed, missing, stale or foreign |
| `circon setup [--upgrade] [--only <id>] [--dry-run]` | Converge the machine, installing only what is missing |
| `circon config` | Set credentials and the conventions repository |
| `circon update` | Pull the conventions and resolve the newest compatible tag |
| `circon enroll --url <u> --token <t>` | Join a control plane |
| `circon agent` | Run as a daemon: heartbeat, live logs, claim jobs |
| `circon init [name]` | Scaffold a pnpm monorepo wired to the gate |
| `circon job <owner>__<repo> [n]` | Clone or update a connected project, then run it |
| `circon run [maxLoops]` | Run the autonomous loop in the current project |
| `circon status` | Show tasks done and open in this project |
| `circon stop` | Stop the loop cleanly, between iterations |
| `circon verify [reason]` | Run a Claude Code review of the recent diff |
| `circon report [--stdout]` | This machine's activity and health; the fleet-wide digest is on the dashboard |
| `circon gc [--dry-run]` | Reclaim disk: old logs, merged run branches |

## Configuration

| Path | Purpose |
|---|---|
| `~/.config/circon/config.json` | Non-secret preferences: budgets, review cadence, iOS runner mode |
| `~/.config/circon/*.env` | Credentials, mode 0600 |
| `~/.config/circon/enrollment.json` | Control-plane credential for this runner, mode 0600 |
| `~/AI-Workspace/conventions/` | Shared engineering conventions (a git clone) |
| `~/.local/state/circon/` | Run logs, the run lock, the spend ledger |

## The hosted parts

`packages/control-plane` (a Cloudflare Worker with Durable Objects and D1) and
`packages/dashboard` (Next.js on Cloudflare) are the fleet side.
`packages/website` is the public landing page in English and German: a static
export served by a Worker. They handle
projects connected through a GitHub App, runners, jobs, live logs and billing.
[SETUP.md](SETUP.md) covers deploying them.

## Requirements

Ubuntu 24.04+ with an NVIDIA GPU (developed against an RTX 3060), or a Mac with
Apple Silicon. On a Mac, Ollama runs on Metal, and iOS tests run on the
simulator; install Xcode from the App Store first, since it can't be installed
unattended. Either way, leave enough disk for the Android SDK.

## License

The CLI is MIT. The control plane and dashboard are FSL-1.1-ALv2.
