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

**Phase 1 — visibility**

- [ ] `circon enroll --token <t>` — exchange a one-time token for a runner credential
- [ ] Durable Object per runner: state, heartbeat, current job, log ring buffer
- [ ] WebSocket log streaming, dashboard subscribes to the same DO
- [ ] Next.js dashboard on Workers, Clerk auth, D1 for run history and cost

**Phase 2 — configuration and PRDs from the dashboard**

- [ ] Per-runner config: which models, which gate tiers, which features
- [ ] Org-level defaults that a runner can override
- [ ] Secret distribution (Anthropic, Cloudflare, Clerk, Sentry, Telegram)
- [ ] PRD editing in the dashboard, committed to GitHub via a GitHub App
- [ ] Push config and PRD changes to a running runner over its existing socket
- [ ] Apply them at the **next iteration boundary**, never mid-iteration
- [ ] Encrypted local cache so an unreachable control plane never blocks a run
- [ ] Per-runner revocation

**Phase 3 — runners as daemons**

- [ ] `circon agent` — long-lived process, connects to its DO, heartbeats, waits
- [ ] systemd unit (Linux) and launchd agent (macOS), enabled at boot
- [ ] Start / stop / queue a job from the dashboard
- [ ] Restart with backoff; survive control-plane outages without dying
- [ ] Reuse the existing run lock so a dispatched job cannot race a manual one

The GitLab-runner model, entirely on the existing stack. DO hibernation means
idle runners cost nothing.

Deferred until the CLI settles, because the runner protocol should not be
designed against a moving target.

#### Configuration, and why phase 2 is a bigger step than it looks

The goal is that a new machine needs one command — `circon enroll --token …` —
and pulls everything else. That is right, and it is what makes runners
disposable. But it changes what the control plane *is*.

Phase 1 keeps it a **view plus job dispatcher**: conventions and PRDs live in
GitHub, so it never holds anything that matters. Phase 2 makes it a
**configuration and secret store**, which is a different security posture and
should be built deliberately, not by accident.

Two kinds of setting, and they should not be handled the same way:

| | Examples | Where it can live |
|---|---|---|
| **Config** | architect/editor model, `verifyEvery`, enabled gate tiers, `iosRunnerMode`, conventions repo | D1, plain. Low blast radius. |
| **Secrets** | `ANTHROPIC_API_KEY`, Cloudflare token, Clerk keys, Telegram bot token | Cloudflare Secrets Store bound to the Worker — never D1, never plain |

Per-runner config is the genuinely useful part: the RTX 3060 box runs a local
editor model, a laptop or the Mac mini runs cloud-only, and each advertises the
gate tiers its hardware can actually serve. `iosRunnerMode` stops being hand-
edited and becomes a property of the runner the dashboard already knows about.

Four decisions to make before writing any of it:

1. **Precedence.** Dashboard as source of truth with local `config.json` as
   fallback, or local overrides win? Recommend dashboard wins, local is cache —
   otherwise "why is this runner behaving differently" becomes unanswerable.
2. **Offline behaviour.** A runner today works with no network beyond the model
   APIs. If config lives remotely, an unreachable control plane must fall back
   to the cached copy rather than refusing to run. Otherwise centralising
   configuration turns a working machine into one that depends on a service
   being up — a clear regression.
3. **Where the PRD actually lives.** The dashboard should be an *editor*, not
   the store: it writes through to GitHub with a GitHub App. That keeps history,
   PR review and offline access, and stops the control plane becoming a file
   server that needs its own conflict resolution. A runner still reads the PRD
   from the repo — the dashboard just saves you opening an editor.
4. **Enrolment vs runtime credential.** A short-lived one-time enrolment token
   exchanged for a per-runner credential, so a compromised runner is revoked
   alone. A single shared long-lived token is simpler and much worse.

#### Live updates: reconciling with the "no mid-loop pull" rule

Updating a running runner's PRD and config **contradicts an invariant the CLI
was built around**, so it needs stating rather than quietly reversing.

Today conventions and the PRD are fetched once at run start and never again,
because pulling while the agent is mid-edit races its own commits: aider writes
to a file that changed underneath it, `git reset --hard` on a failed gate throws
away the wrong thing, and the task the agent is working on can vanish.

The resolution is that **"live" should mean the next iteration boundary, not
mid-write**. The loop already pauses between iterations to check the stop flag —
that same point is where a pushed config or PRD update gets applied. In practice
that is seconds to minutes, which is what "update it while it runs" actually
needs, and it keeps every guarantee:

- no file changes underneath a running aider process
- the gate's revert still only ever discards the agent's own work
- an iteration's inputs are fixed for its whole duration, so a failure is
  reproducible

Mechanism: the runner already holds a WebSocket to its Durable Object for log
streaming, so the control plane pushes a "config changed" / "PRD changed" event
and the runner applies it at the next boundary. No polling, and no separate
transport.

One case still needs a decision: an update that lands while the agent is
mid-task on something the update deletes. Options are finish the iteration then
re-plan, or abort and revert immediately. Recommend finishing — an aborted
iteration wastes the tokens already spent and leaves progress notes describing
work that was thrown away.

Secrets are the part to be conservative about. Distributing them means the
control plane's blast radius becomes every credential on every runner — worth it
for disposable runners, but it needs Secrets Store, TLS-only delivery,
short-lived tokens, and an audit trail. `ARCHITECTURE.md` already mandates
least-privilege Cloudflare tokens, which limits the damage if one leaks.

### Pin conventions to what the runner actually has

- [ ] Version the conventions repo (git tags, semver)
- [ ] `@circon/cli` declares the convention range it supports
- [ ] Runner pulls the newest conventions **within** that range, not just `HEAD`
- [ ] `circon doctor` reports conventions requiring tooling that is not installed
- [ ] Dashboard shows each runner's CLI version and resolved convention version

`ARCHITECTURE.md` states things like which package manager, which Expo SDK and
which Node version to build against. Nothing today checks that against the
machine, so a convention edit can instruct the agent to use tooling the runner
does not have — and the failure surfaces as a confusing gate error several
iterations later, not as "your conventions and your machine disagree".

The fix is to treat conventions as a versioned dependency of the CLI rather than
a floating pointer:

```
conventions v3  ── requires ──▶  cli >= 0.4   (pnpm 10, Node 24, Expo 57)
conventions v4  ── requires ──▶  cli >= 0.6   (Expo 58)
```

A runner on CLI 0.4 keeps resolving to conventions v3 and stays internally
consistent. Upgrading the conventions to require new tooling then forces a
deliberate `npm update -g @circon/cli && circon setup --upgrade`, instead of
silently instructing an agent to use something that is not there.

This is the same discipline the component model already applies to the machine —
pinned versus floating, and never an implicit upgrade — extended to the contract
the agent follows. It is worth doing even without a control plane; the dashboard
just makes the mismatch visible across a fleet.

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

### CI/CD shipped inside the boilerplate

- [ ] `.github/workflows/ci.yml` in the template — typecheck, test, gate tiers
- [ ] `.github/workflows/deploy.yml` — web + Workers to Cloudflare
- [ ] `codemagic.yaml` — iOS dev builds and both platforms' store releases
- [ ] Changesets wired into the project template
- [ ] `circon init` creates the GitHub repo and pushes, so CI exists from commit one

The scaffold and its pipeline are **one deliverable**, not two: a boilerplate
that arrives without CI gets a hand-rolled pipeline per project, which is
exactly the drift `ARCHITECTURE.md` exists to prevent. Treat the workflows as
part of the template.

What exists today is release infrastructure for **the CLI itself**. Projects
created by `circon init` have none.

The split decided earlier: Android dev builds run **locally** on the box (free,
no queue, the SDK is already there); only iOS needs cloud. Codemagic's 500 free
minutes/month covers the expected iOS volume, where EAS's 15-build cap would be
consumed by development alone.

Worth reusing rather than reinventing: this repo's own `ci.yml` already solves
the shape — reusable via `workflow_call`, with the release gated on it through
`needs:` so a publish can never outrun its checks. The project template should
copy that structure.

Once the control plane exists, the deploy credentials these workflows need
(Cloudflare token, Codemagic key) are the same secrets phase 2 distributes — so
`circon init` could register the repo and provision its CI secrets in one step
rather than leaving a manual checklist behind.

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
