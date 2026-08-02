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

### Credentials and context7

- [ ] `circon config` prompts for GitHub, Clerk, Cloudflare and Sentry tokens
- [ ] Guidance or tooling for least-privilege Cloudflare tokens
- [ ] Install context7 MCP so agents get current docs for fast-moving betas

`ARCHITECTURE.md` mandates Cloudflare tokens scoped to a single account and only
that project's resources — with nothing to produce them. context7 matters
because the stack leans on packages that move fast (HeroUI Native is at 1.0
beta), where training data goes stale.

---

## Operational

- [ ] Install the CLI tarball on the Ubuntu box and read `circon doctor`
- [ ] `circon setup` twice — the second run must be a clean no-op
- [ ] A real `circon run` on a throwaway project
- [ ] Publish `0.1.0` by hand, then configure the npm trusted publisher
      (org `circon-io`, repo `circon`, workflow `release.yml`)
- [ ] Push `circon-conventions` to `circon-io`
- [ ] Legacy cleanup on the box: remove `/usr/local/bin/{ralph,solyd-*}` and
      `systemctl --user disable --now solyd-daily-report.timer` — it is still
      enabled and will fail nightly calling a deleted script
- [ ] Rename the local directory `solyd-machine` → `circon`

**Nothing Linux-specific has ever executed.** Only `doctor` and
`setup --dry-run` are verified, and on macOS nearly every component skips. Every
`install()`, and all the apt/snap/systemd/ollama/android probes, are unexercised.
Read `doctor` carefully before letting `setup` touch a working machine.

---

## Decided against

**Docker.** Not the right axis. NVIDIA kernel modules, KVM, the Android emulator
and USB for go-ios all need host hardware access, which is the point of this
machine. The agent runtime needs adb, the emulator, the GPU, USB and the project
tree — a container with all of that mounted is a worse chroot. For reproducible
*machines* the tool is cloud-init or Ansible. Only Ollama would benefit, and
that is optional.
