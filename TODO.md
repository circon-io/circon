# TODO

Work that is designed but not built, with the reasoning that led to deferring
it. Kept so the *why* survives — a bare task list loses the decision.

---

## Half-built

### Telegram inline keyboards

- [ ] Attach `CONTROL_BUTTONS` to the notifications sent by `circon run`

`circon listen` already handles the `Stop` / `Status` / `Last log` callbacks and
`CONTROL_BUTTONS` is defined in `packages/cli/src/agent/notify.ts`, but no
message ever passes it — every `notify()` call in `commands/run.ts` omits the
options argument, so there is nothing to press. Roughly ten lines.

This was chosen as the "fleet control now" answer ahead of a dashboard, so it
should land before anything in the control-plane section below.

---

## Deferred by decision

### iOS feedback — Loop 3

- [ ] Choose the runner (device or Mac mini)
- [ ] Implement the chosen `iosRunnerMode` and its `.circon/flows/ios.sh`

Shipped as a stub: `iosRunnerMode: 'none'` in `~/.config/circon/config.json`,
with the gate's ios tier already wired to read it. Web and Android feedback need
no Apple hardware, so this waits until they prove insufficient.

**The constraint, so it is not re-derived:** the iOS Simulator is macOS-only.
Headless does not reduce rendering — it skips a window, not GPU work. A QEMU
macOS VM has no Metal and never touches the NVIDIA GPU. Apple has a documented
open issue with the Simulator inside macOS VMs. baguette is Apple Silicon only
while Docker-OSX emulates Intel, so they are mutually exclusive, and Xcode 27
begins dropping Intel.

Two viable paths, both researched:

| Mode | How | Cost | Catch |
|---|---|---|---|
| `device` | EAS builds a dev-client IPA → `go-ios` installs it from Linux → Metro serves JS over LAN → WebDriverAgent exposes the accessibility hierarchy | ~€100 phone + Apple Developer account | UDID must be registered **before** the build; one device per concurrent agent |
| `mac` | Apple Silicon Mac running baguette as a headless simulator farm, driven over SSH | ~$599 M4 mini | needs the machine |

Recommendation when it matters: the Mac mini. baguette is a *farm*, so one Mac
serves N agents where N iPhones serve N. It also becomes the fastlane signing
machine.

Only the native shell needs rebuilding — a dev-client build loads its JS from
Metro at runtime, so iteration does not cost a cloud build.

### Cloudflare control plane

- [ ] `circon runner --token <t>` — register, heartbeat, accept jobs
- [ ] Durable Object per runner: state, heartbeat, current job, log ring buffer
- [ ] WebSocket log streaming, dashboard subscribes to the same DO
- [ ] Next.js dashboard on Workers, Clerk auth, D1 for run history and cost

The GitLab-runner model, entirely on the existing stack. DO hibernation means
idle runners cost nothing.

Deferred until the CLI settles, because the runner protocol should not be
designed against a moving target. The decision that keeps this small: conventions
and PRDs live in GitHub, so the control plane stays a **view plus job
dispatcher** and never becomes a file server.

### Project scaffold — wire the real stack

- [ ] `apps/web` — Next.js on Cloudflare via `@opennextjs/cloudflare`, HeroUI, Fragment UI
- [ ] `apps/mobile` — Expo with HeroUI Native
- [ ] `services/api` — Cloudflare Worker
- [ ] Zustand, Clerk, Sentry, i18n (en + de) wired in
- [ ] `packages/ui` adapter so Fragment UI can be swapped out locally

`circon init` currently produces an empty monorepo shell plus the gate flows.
`ARCHITECTURE.md` already specifies all of the above; nothing generates it.

Note on Fragment UI: 6 stars and self-described "Work in Progress", and it would
own auth and billing screens. Keep it behind `packages/ui` so replacing it is a
local change rather than a rewrite.

### Release infrastructure for scaffolded projects

- [ ] Codemagic config for iOS dev builds and both platforms' store releases
- [ ] GitHub Actions deploying web + Workers to Cloudflare
- [ ] Changesets wired into the project template

What exists today is release infrastructure for **the CLI itself**. Projects
created by `circon init` have none.

The split decided earlier: Android dev builds run **locally** on the box (free,
no queue, the SDK is already there); only iOS needs cloud. Codemagic's 500 free
minutes/month covers the expected iOS volume, where EAS's 15-build cap would be
consumed by development alone.

### macOS as a first-class runner

- [ ] Give `Component` per-platform install strategies instead of `linuxOnly`
- [ ] `brew-base` alongside `apt-base`; Node and aider via Homebrew on darwin
- [ ] Ollama on macOS (Metal, no CUDA path) and the Android SDK mac tarball
- [ ] launchd agent instead of the systemd `--user` timer for the daily report
- [ ] Screen Sharing / VNC instead of GNOME Remote Desktop
- [ ] Lift the `uname -s` guard in `init.sh`, or ship a `bootstrap-macos.sh`

**7 of 19 components already work anywhere** — `node`, `js-globals`, `aider`,
`workspace`, `conventions`, `shell-env`, `git-identity`. `doctor` runs cleanly
on macOS today and reports the rest as *skipped*. So this is filling gaps, not
a rewrite.

The 12 that need a darwin path:

| Component | macOS equivalent |
|---|---|
| `apt-base` | Homebrew formulae |
| `nvidia`, `kvm`, `sysctl` | **not applicable** — Metal replaces CUDA, no KVM, kqueue has no inotify limit |
| `docker` | Docker Desktop or colima |
| `ollama`, `ollama-model` | native installer; `ollama-tuning` is a no-op (flash attention is a Linux systemd override) |
| `android-studio`, `android-sdk` | both exist for macOS; the cmdline-tools URL is `commandlinetools-mac-*` |
| `ssh` | Remote Login via `systemsetup` |
| `daily-report` | launchd plist, not systemd |

`Component.linuxOnly` is the wrong shape for this — it should become something
like `platforms: ['linux', 'darwin']` with the install body branching, or
platform-specific variants selected in the registry. Worth deciding before more
components are written against the current flag.

**Why this matters more than it looks:** macOS support and the Mac mini in the
iOS section are the *same purchase*. If the Mac runs circon natively, Loop 3
stops being an SSH-orchestrated appliance and becomes a local gate tier — no
`go-ios`, no remote transport, no `mac` mode at all. A second runner that also
happens to be the only machine that can build and test iOS.

It would also let the loop run on the laptop, without RDP into the Ubuntu box.

### Credentials and context7

- [ ] `circon config` prompts for GitHub, Clerk, Cloudflare and Sentry tokens
- [ ] Guidance or tooling for least-privilege Cloudflare tokens
- [ ] Install context7 MCP so agents get current docs for fast-moving betas

`ARCHITECTURE.md` mandates Cloudflare tokens scoped to a single account and only
that project's resources — with nothing to produce them. context7 matters
because the stack leans on packages that move fast (HeroUI Native is at 1.0
beta), where training data goes stale.
