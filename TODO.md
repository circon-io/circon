# TODO

Work that is designed but not built, with the reasoning that led to deferring
it. Kept so the *why* survives — a bare task list loses the decision.

Ordered by what should happen first.

---

## 0. Prove the loop

- [ ] One real `circon run` on a throwaway project, end to end

Everything below assumes aider plus a 7B local editor can reliably finish a PRD
task and that the accessibility gate catches real regressions. Neither has been
observed once. Until it has, the rest of this list is building on an unverified
premise — the control plane would be a window onto nothing.

---

## 1. Spend control

- [x] `budget.perRun` and `budget.perDay` in config, dashboard-editable
- [x] Parse aider's per-message cost line; accumulate per run
- [x] Add the verify pass and any cloud build to the same ledger
- [x] **Hard stop** when a cap is hit, mid-run, not a warning after the fact
- [x] Spend ledger at `~/.local/state/circon/spend.json`, rolling per day
- [x] Cost per run in the daily report and in the PR body
- [x] Refuse to start a run that would exceed the daily cap

Correctness has a circuit breaker; spend has nothing. `verifyBudgetUsd` caps one
review pass at $0.50 and that is the only limit anywhere.

The gap that matters: the breaker trips on **three consecutive gate failures**,
so a loop that passes its gate every time while producing mediocre work runs all
20 iterations at full price. Multiply by N runners taking jobs from a dashboard.

A daily cap needs to be machine-wide rather than per-run, or twenty small runs
cost the same as one runaway.

---

## 1.5 GitHub connection — the missing foundation

- [x] GitHub App: registration documented, private key as a secret (PKCS#8 conversion)
- [x] "Connect GitHub" in the dashboard → App install → `installation_id` per org
- [x] `installation` / `installation_repositories` webhooks keep the grant current
- [x] Repo picker in the dashboard, listing repos the installation can see
- [x] Data model: `integrations` → `projects`, with plan limits on both
- [x] `projectIsRunnable` refuses a job for a disconnected or inactive project
- [x] Write the chosen repo into the `projects` table
- [x] `GET /api/runner/clone-token` — mint a short-lived, repo-scoped install token
- [x] Runner clones over HTTPS with that token instead of relying on its SSH key
- [x] Open the review PR with the same token, dropping the `gh` login requirement
- [x] `QueueJob` picks from connected projects instead of taking a typed slug

**This was assumed solved and never built** — it is now. TODO used to say "a
dashboard project *is* a connected GitHub repository" as though the connection
existed, while:

- the `projects` table was created by migration `0001` and **never read or
  written** — a dead table
- there was **no GitHub integration of any kind** — no App, no OAuth, no token
- `circon job` cloned `git@github.com:org/repo.git`, so it only worked where the
  runner's SSH key had been authorized by hand
- `QueueJob` took a hand-typed slug with no check that the repo existed

### Why a credential helper, not a token in the URL

The obvious implementation — clone from
`https://x-access-token:<token>@github.com/…` — is wrong twice over. The token
lands in `.git/config` where it outlives the run, and it expires after an hour,
so the *second* iteration's push fails with a bare 403 long after the URL was
written.

So git is configured to call back into the CLI: `circon git-credential` answers
git's credential protocol by asking the control plane for a fresh
repository-scoped token per request. Clone, fetch, pull and push all work,
nothing is persisted, and expiry stops being anyone's problem. `useHttpPath` is
what makes it possible — without it git omits the path and the helper cannot tell
which repository is being asked about, so it would have to guess.

### The model

```
org (Clerk, holds the plan)
 └── integration   a connected provider account — a GitHub App installation
      └── project  one repository from that integration
```

Three levels rather than two, because **one installation covers many
repositories**. Collapsing integration and project would mean a fresh connection
per repo, which is not how installations work.

`project = repo` is what the rest of the system already assumes: the `org__repo`
slug is simultaneously the dashboard identifier, the runner's directory name and
the job payload.

A project is `active` only while its integration is live and the repo still
accessible. Uninstalling the App marks projects inactive rather than deleting
them, so the dashboard can say *why* something stopped — and inactive projects do
not consume the plan allowance, or uninstalling would lock you out of connecting
a replacement.

Plan limits: **basic** 1 project / 1 integration, **pro** 10 projects /
3 integrations.

A **GitHub App** is the right mechanism rather than OAuth or a PAT: grants are
per-repository, tokens are short-lived and installation-scoped, and revoking is
uninstalling. It also removes two current hacks — pre-authorized SSH keys, and
`gh auth` on the runner for PR creation.

Sequencing note: this blocks the dispatch story end to end, so it comes before
anything in the control-plane section that assumes a project exists.

## 2. Projects, branches, review and release

The runner currently has no idea what a project is — `circon run` operates on
`process.cwd()`. Dispatching a job from a dashboard needs all of this.

### Workspace

- [x] Clone to `~/circon-projects/<org>__<repo>`, one directory per project
- [x] `circon job <project-slug>` — clone or pull, then run
- [x] Pull `main` before each run; never touch the working tree of another job

A dashboard project *is* a connected GitHub repository, so the slug is already
`<organization>__<repository>`. That becomes the directory name, and the runner
never has to guess where anything lives.

### Branch per run, not a long-lived work branch

- [x] Replace `circon/work` with `circon/run-<date>-<shortid>`
- [x] Delete the branch when its PR merges or the run is abandoned

`circon/work` accumulates unrelated work and can never be partially accepted.
One branch per run maps 1:1 to a PR and therefore 1:1 to a review decision:
abandoned runs are deleted without touching anything else, and conflicts stay
bounded to a single run's changes.

### The review artifact

- [x] Open a PR automatically when a run finishes with commits (via `gh`; move to the App token)
- [x] Generate the body: tasks done, agent notes, gate results per tier, cost
- [x] Capture a screenshot per screen at the end of a green run, attach to the PR
- [ ] Link the PR to its dashboard run view, and the run view back to the PR

**Accessibility trees are for the machine; screenshots are for the human.** The
gate must keep asserting on the tree — pixels are the wrong thing to fail a
build on. But a reviewer deciding whether this is worth shipping wants to see
it, and `agent-device` already has a `screenshot` command. Capture them once,
after the gate is green, purely as a review artifact.

### Two approval gates

```
run ──▶ PR ──▶ [gate 1: merge]  ──▶ main
                                     └──▶ version PR ──▶ [gate 2: release] ──▶ prod
```

- [ ] Gate 1 — merging the PR means "this code is accepted"
- [x] Gate 2 — merging the Changesets version PR triggers the actual release
- [ ] Release report in the dashboard: changelog, screenshots, gate results,
      Codemagic dev-build link, cost
- [ ] Approving the release report merges the version PR

Two gates because they answer different questions. Gate 1 is "is this code
correct" and belongs on the PR, next to the diff. Gate 2 is "should this go to
users now" and belongs to whoever owns the product — they should be able to
approve a changelog, look at screenshots and install a dev build without reading
a diff. The changeset flow already produces the changelog; the dashboard just
needs to render it as a report with an approve button.

For mobile, the dev build is the artifact that makes gate 2 real: Codemagic
builds the PR, the reviewer installs it, then approves.

---

## 3. Cloudflare control plane

**Phase 1 — visibility**

- [ ] `circon enroll --token <t>` — exchange a one-time token for a runner credential
- [ ] Durable Object per runner: state, heartbeat, current job, log ring buffer
- [ ] WebSocket log streaming, dashboard subscribes to the same DO
- [ ] Next.js dashboard on Workers, Clerk auth, D1 for run history and cost

**Phase 2 — configuration, PRDs and secrets**

- [ ] Per-runner config: models, gate tiers, budgets, features
- [ ] Org-level defaults a runner can override
- [ ] PRD editing in the dashboard, written through to GitHub via a GitHub App
- [ ] Push config and PRD changes to a running runner over its existing socket
- [ ] Apply them at the **next iteration boundary**, never mid-iteration
- [ ] Encrypted local cache so an unreachable control plane never blocks a run
- [ ] Per-runner revocation

**Phase 3 — runners as daemons**

*Not started. `circon agent` exists as a command but nothing installs it as a
service, so a runner never comes back after a reboot.*

- [ ] `circon agent` — long-lived process, connects to its DO, heartbeats, waits
- [x] systemd unit enabled at boot, restart with backoff
- [ ] Start / stop / queue a job from the dashboard
- [ ] Survive control-plane outages without dying or losing the current job
- [ ] Reuse the existing run lock so a dispatched job cannot race a manual one

DO hibernation means idle runners cost nothing. Deferred until the CLI settles,
because the runner protocol should not be designed against a moving target.

### Secret scoping

Two scopes, because a runner works on many projects and
`ARCHITECTURE.md` mandates Cloudflare tokens scoped to a single project:

| Scope | Examples | Lifetime |
|---|---|---|
| **Machine** | `ANTHROPIC_API_KEY` | held by the runner, rotated centrally |
| **Project** | Cloudflare token, Clerk keys, Sentry DSN | fetched at job start, held only for that job |

- [ ] Store both in Cloudflare Secrets Store, never in D1
- [ ] Runner requests project secrets for the job it was dispatched, nothing else
- [ ] Drop project secrets from memory and disk when the job ends
- [ ] Rotation: change centrally, runners pick it up at the next job

Distributing secrets makes the control plane's blast radius every credential on
every runner. Per-project scoping is what keeps a compromised runner from
becoming a compromised estate.

---

## 3.5 Wire the loop back to the control plane

- [x] `run.ts` calls `reportRun()` at start and at every exit path
- [ ] Stream log lines to the runner's Durable Object during a run
- [ ] Send `run-started` / `run-finished` so the dashboard status is live

`reportRun()` used to exist and never be called, leaving the dashboard's run
history and 24-hour cost figure permanently empty even with a runner enrolled and
working. It is now called twice: once at start, so a live run shows a truthful
start time, and once from the `finally`, so no exit path — circuit breaker,
infrastructure failure, or an uncaught throw — can leave a run stuck at
`running`. The endpoint upserts on `runId`, which is what makes reporting twice
safe.

## 4. Stop the agent editing the human's file

- [x] Move task completion out of `PRD.md` into `.circon/progress.json`
- [x] Agent reads `PRD.md`, never writes it
- [x] `completedTaskFromDiff` reads the state file instead of the staged diff
- [x] `circon status` renders progress; the daily report reads the state file

**This is the fix for mid-run PRD updates.** The conflict exists because both
sides write the same file: the human edits the spec on `main`, the agent flips
`- [ ]` to `- [x]` on the run branch. Merging `main` mid-run then conflicts on
exactly the lines both touched.

If `PRD.md` is written by one side only, merging it is always clean, and a live
PRD update becomes a fast-forward of a file the agent never touches.

Trade-off, stated honestly: `PRD.md` stops showing progress at a glance. That
view moves to `circon status` and the dashboard. Worth it — the alternative is
conflict resolution inside an autonomous loop, which is where this design gets
genuinely dangerous.

---

## 5. Tell infrastructure failure apart from gate failure

- [x] Preflight each iteration: Ollama responding, model loaded, disk headroom
- [x] Classify known infra signatures in gate output (ECONNREFUSED, OOM, ENOSPC)
- [x] Infra failures do **not** count toward the circuit breaker
- [x] Retry with backoff instead; alert as "infrastructure", not "gate failed"

Today an Ollama OOM fails the gate, trips the breaker after three iterations,
and reports "gate failure at the unit tests tier". The diagnosis is wrong and
three iterations were paid for to reach it.

---

## 6. Automatic cleanup

- [x] `circon gc`, run after each job and on the daily timer
- [x] Prune run logs older than 30 days
- [x] Delete local `circon/run-*` branches whose PR is merged or closed
- [x] Remove `.circon/*.log` from project working trees
- [x] `pnpm store prune` when the store exceeds a threshold
- [x] Report reclaimed space; refuse to run a job below a disk floor

Deliberately **not** pruned: Ollama models (a re-pull is gigabytes), Docker
volumes, and anything inside a project's `node_modules` that pnpm still
references. Only things that are cheap to recreate.

The box was at 94% full before any of this existed, and nothing currently
deletes anything.

---

## 7. Pin conventions to what the runner has

- [x] Version the conventions repo (git tags, semver)
- [x] `@circon/cli` declares the convention range it supports
- [x] Runner resolves the newest conventions **within** that range, not `HEAD`
- [x] `circon doctor` reports conventions requiring tooling that is not installed
- [ ] Dashboard shows each runner's CLI and resolved convention version

`ARCHITECTURE.md` states which package manager, Expo SDK and Node version to
build against. Nothing checks that against the machine, so a convention edit can
instruct the agent to use tooling the runner does not have — surfacing as a
confusing gate error several iterations later rather than "your conventions and
your machine disagree".

```
conventions v3  ── requires ──▶  cli >= 0.4   (pnpm 10, Node 24, Expo 57)
conventions v4  ── requires ──▶  cli >= 0.6   (Expo 58)
```

Same pinned-versus-floating discipline the component model already applies to
the machine, extended to the contract the agent follows.

---

## 8. Project scaffold — wire the real stack

- [ ] `apps/web` — Next.js on Cloudflare via `@opennextjs/cloudflare`, HeroUI, Fragment UI
- [ ] `apps/mobile` — Expo with HeroUI Native
- [x] `services/api` — Cloudflare Worker
- [x] Zustand, Clerk, Sentry, i18n (en + de) wired in
- [x] `packages/ui` adapter so Fragment UI can be swapped out locally

`circon init` currently produces an empty monorepo shell plus the gate flows.
`ARCHITECTURE.md` already specifies all of the above; nothing generates it.

Fragment UI is at 6 stars and self-described "Work in Progress", and it would
own auth and billing screens. Keep it behind `packages/ui` so replacing it is a
local change rather than a rewrite.

---

## 9. CI/CD shipped inside the boilerplate

- [x] `.github/workflows/ci.yml` in the template — typecheck, test, gate tiers
- [x] `.github/workflows/deploy.yml` — web + Workers to Cloudflare
- [ ] `codemagic.yaml` — iOS dev builds and both platforms' store releases
- [ ] Changesets wired into the project template
- [ ] `circon init` creates the GitHub repo and pushes, so CI exists from commit one

The scaffold and its pipeline are **one deliverable**. A boilerplate that
arrives without CI gets a hand-rolled pipeline per project, which is exactly the
drift `ARCHITECTURE.md` exists to prevent.

Android dev builds run **locally** on the box (free, no queue, the SDK is
already there); only iOS needs cloud. Codemagic's 500 free minutes/month covers
the expected iOS volume, where EAS's 15-build cap would be consumed by
development alone.

Reuse this repo's own `ci.yml` shape — reusable via `workflow_call`, release
gated through `needs:` so a publish cannot outrun its checks.

---

## 10. Credentials and context7

- [x] `circon config` prompts for GitHub, Clerk, Cloudflare and Sentry tokens
- [x] Guidance or tooling for least-privilege, per-project Cloudflare tokens
- [x] Install context7 MCP so agents get current docs for fast-moving betas

context7 matters because the stack leans on packages that move fast (HeroUI
Native is at 1.0 beta), where training data goes stale.

---

## 11. iOS feedback — Loop 3

- [ ] Buy the phone or the Mac, then implement that `iosRunnerMode`
- [ ] `.circon/flows/ios.sh`

Shipped as a stub: `iosRunnerMode: 'none'`, with the gate's ios tier already
wired to read it. Web and Android need no Apple hardware, so this waits.

**The constraint, so it is not re-derived:** the iOS Simulator is macOS-only.
Headless does not reduce rendering — it skips a window, not GPU work. A QEMU
macOS VM has no Metal and never touches the NVIDIA GPU. Apple has a documented
open issue with the Simulator inside macOS VMs. baguette is Apple Silicon only
while Docker-OSX emulates Intel, so they are mutually exclusive, and Xcode 27
begins dropping Intel.

| Mode | How | Cost | Catch |
|---|---|---|---|
| `device` | EAS builds a dev-client IPA → `go-ios` installs it from Linux → Metro serves JS over LAN → WebDriverAgent exposes the hierarchy | ~€100 phone + Apple Developer account | UDID registered **before** the build; one device per concurrent agent |
| `mac` | Apple Silicon Mac running baguette as a headless simulator farm, over SSH | ~$599 M4 mini | needs the machine, and see below |

Only the native shell needs rebuilding — a dev-client build loads its JS from
Metro at runtime, so iteration does not cost a cloud build.

**`device` is the one to build.** Ubuntu-only is the target, and `mac` mode
means writing an SSH transport that macOS runner support (v2) would immediately
make redundant. If a Mac is ever bought, run circon on it natively and iOS
becomes a local gate tier with no transport at all.

---

## v2 — nice to have

### macOS as a runner

- [ ] `Component` gains per-platform strategies instead of `linuxOnly`
- [ ] Homebrew base, Ollama on Metal, Android SDK mac tarball
- [ ] launchd instead of systemd; Screen Sharing instead of GNOME RDP

7 of 19 components already work anywhere, and `doctor` runs cleanly on macOS
today, reporting the rest as *skipped*. Not urgent — Ubuntu is the target — but
`Component.linuxOnly` is the wrong shape and is worth replacing before many more
components are written against it.

If it ever lands it collapses the iOS `mac` mode entirely: a Mac running circon
natively tests iOS locally, with no SSH orchestration.

---

## Decided against

**Docker.** Not the right axis. NVIDIA kernel modules, KVM, the Android emulator
and USB all need host hardware access, which is the point of this machine. The
agent runtime needs adb, the emulator, the GPU and the project tree — a
container with all of that mounted is a worse chroot. For reproducible
*machines* the tool is cloud-init or Ansible. Only Ollama would benefit.

**Telegram.** Dropped in favor of the dashboard. Notifications and the
`circon listen` control daemon both go; the dashboard is the single place to see
runs and control them, and maintaining two control surfaces means neither is
trusted.
