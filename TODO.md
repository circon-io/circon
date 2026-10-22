# TODO

Work towards [VISION.md](VISION.md), most urgent first. Each item keeps the
reasoning behind it, because a bare task list loses the decision.

Done work is condensed under [Done](#done). When an item stops making sense, it
moves to [Decided against](#decided-against) together with the reason, instead
of just disappearing.

---

## 0. Prove the loop

- [ ] One real `circon run` on a throwaway project, end to end. Runbook:
      [docs/first-run.md](docs/first-run.md)
- [ ] The same run again, this time with `agents.build` set to `claude-code`

Everything below assumes an agent can reliably finish a PRD task, and that the
accessibility gate catches real regressions. Nobody has seen either happen yet.
Until someone has, everything on this list rests on an unverified premise.

---

## 1. Runner ↔ control plane, actually wired

Much of this was built on one side only. The DO accepted `log`, `run-started`
and `run-finished`, but the CLI never sent them, so the dashboard's log view was
always empty. Remote config was fetched and then thrown away.

- [x] Stream run output to the runner's DO, and send `run-started` and
      `run-finished`
- [x] Heartbeat carries run id, branch, iteration and cost
- [x] Layered config: defaults ← local ← org ← runner ← project. The server
      resolves it at claim time and sends it in the job payload
- [x] Org-level defaults, plus config editing per runner and per project, in the
      dashboard
- [x] `config-changed` and `prd-changed` take effect at the **next iteration
      boundary**, never mid-iteration
- [x] Target a job at a specific runner. `command:'run'` wakes the daemon so it
      claims immediately
- [x] The DO writes `last_seen_at`. A job claimed by a runner that has gone dark
      is put back in the queue
- [x] The dashboard shows each runner's CLI version and resolved conventions
      version
- [x] Conventions are resolved once at job start, not only by `circon update`
- [x] Run view in the dashboard, linked from the PR body and back
- [x] Enforce `runHistoryDays`, `liveLogs` and `monthlySpendCapUsd`, which are
      defined but have never been checked
- [x] **Security:** sign the GitHub install `state`, and confirm through the
      user's OAuth token that they can access the `installation_id`

The callback currently trusts a caller-supplied `installation_id` together with
an unsigned `state=org`. Anyone could attach someone else's installation to
their own org and mint tokens for those repositories.

### Why the PRD can be synced mid-run

CLAUDE.md said "single pull point": conventions and the PRD were fetched once at
start. For conventions, that still holds. They are the contract, and changing
the contract under a running agent is how a loop turns incoherent.

The PRD is different now. The agent never writes it (§4 in Done), so taking the
human's latest version is a one-file checkout with no merge. It happens only
between iterations, so a running edit is never pulled out from under the agent.

---

## 2. Agent backends and per-role models

- [x] `AgentBackend` interface, implemented by aider, Claude Code and Codex
- [x] Roles: `plan` (optional), `build` and `review`, each with its own backend
      and model
- [x] Subscription vs API billing per backend. Subscription cost is recorded as
      notional and does not count against the cap
- [x] A usage-limit reply is classified as infrastructure: wait for the reset,
      without counting a strike
- [x] `codex` component. `doctor` reports binary and auth status for each
      backend
- [x] `circon config` walks through headless login (`claude setup-token`,
      `codex login`)
- [x] `runCommand` takes injected deps, and the loop gets its own tests
- [ ] Check the terms of service. Can a subscription CLI be driven unattended,
      by the subscriber, on their own machine? The API-key path stays either way

**Why:** paying per token makes long autonomous runs expensive. The user already
pays for Claude Code or ChatGPT subscriptions. Splitting the work by role means
the strongest model is used only where it matters. For example, plan with a
reasoning model, build with Opus or a local model, and review with a second
vendor that does not share the first one's blind spots.

---

## 3. Idea → plan → approval

- [x] Dashboard: describe what to build. The control plane generates a PRD with
      our model key, capped per plan
- [x] Refine through chat or direct edits. Every change is a version, with a diff
- [x] Approve: `PRD.md` is committed to the default branch, or a PR is opened if
      the branch is protected
- [x] First job on an empty repository: `circon init --here` scaffolds into it
- [x] Onboarding stepper: Connect → Describe → Plan → Runner → Build

**Why the control plane and not the runner:** in the intended flow, the plan
comes *before* a runner is connected. The cost sits with us, so the number of
generations per month is a plan limit.

The generated PRD must use exactly the `- [ ]` task format that `progress.ts`
parses. A test imports that parser, so the two cannot drift apart.

---

## 4. Review and release

### Two approval gates

```
run ──▶ PR ──▶ [gate 1: merge]  ──▶ main
                                     └──▶ version PR ──▶ [gate 2: release] ──▶ prod
```

- [x] Gate 2: merging the Changesets version PR triggers the release
- [x] Gate 1: PR state (open / merged / closed) through `pull_request` webhooks
- [x] Release report in the dashboard: changelog, screenshots, gate results,
      Codemagic dev build, cost
- [x] Approving the report merges the version PR

There are two gates because they answer different questions:
- **Gate 1** asks "is this code correct?". It belongs on the PR, next to the diff.
- **Gate 2** asks "should this go to users now?". It belongs to whoever owns the
  product. They should be able to approve a changelog, look at screenshots and
  install a dev build without reading a diff.

### Secrets

| Scope | Examples | Lifetime |
|---|---|---|
| **Machine** | `ANTHROPIC_API_KEY` | held by the runner, rotated centrally |
| **Project** | Cloudflare token, Clerk keys, Sentry DSN | fetched at job start, held only for that job |

- [x] Envelope-encrypted in D1 (AES-GCM, master key as a Worker secret).
      Write-only from the dashboard
- [x] A runner receives only the secrets for the project it was dispatched for
- [x] Held in memory, injected into the agent and gate environments, dropped at
      job end
- [x] Rotation: change it centrally, and runners pick it up at the next job
- [x] The agent asks for credentials it lacks: a `NEEDS-SECRET: NAME — reason`
      line in its notes becomes a request in the dashboard's Requests inbox.
      Answering it stores a project secret and pushes `secrets-changed`; the
      run picks the value up at the next iteration boundary, without a restart

**Why an inbox and not a failure:** a missing Stripe key is not a bug the agent
can fix. Before this it either stubbed the integration or burned iterations on
it. Now it builds what it can and the human answers once.

Distributing secrets puts every credential on every runner inside the control
plane's blast radius. Scoping them per project is what stops a compromised
runner from becoming a compromised estate.

---

## 5. Project template: portable by construction

- [x] `services/api` on Hono: auth middleware (Clerk JWT), `requireRole`, `/me`,
      an example admin route, a Clerk webhook. One adapter per hosting target
- [x] `packages/domain` for business logic, and Drizzle on SQLite (D1 by
      default, libSQL elsewhere)
- [x] `apps/mobile`: Expo Router, HeroUI Native, a role-gated admin area,
      exported to web
- [ ] `apps/web` (optional, marketing and SEO only): Next.js, OpenNext
      Cloudflare, HeroUI. Not in the default template: most products do not
      need one, and the app's web export already covers the admin area
- [x] `packages/ui`: HeroUI Native wrappers that require `testID` and
      `accessibilityLabel` (one implementation, since the app renders HeroUI
      Native on the web too)
- [x] `codemagic.yaml` (iOS dev client plus store releases) and Changesets
- [ ] First real Codemagic run of `dev-client` and `release`. The workflow
      parses, but nobody has signed and shipped a build through it yet
- [x] `.github/workflows/ci.yml` and `deploy.yml` in the template
- [x] Zustand, Clerk, Sentry and i18n (en + de) packages
- [x] Conventions v2: the rules above, written down for the agent

**Why the admin area lives in the Expo app:** a second UI codebase is a second
thing for the agent to keep in sync. Expo exports to web, so admins still get a
browser.

**Why Hono and Drizzle on SQLite:** each one keeps the code identical across
hosts, and only an adapter file changes per target. That is what keeps one-click
hosting on Netlify, Vercel, GCP and AWS, and managed per-customer hosting, an
addition instead of a rewrite.

Fragment UI has 6 stars and calls itself "Work in Progress", and it would own
the auth and billing screens. Keep it behind `packages/ui`, so replacing it is a
local change.

---

## 6. Device testing and macOS runners

- [x] Boot the `circon_pixel` emulator when the gate needs a device, and reap it
      afterwards
- [x] `Component.platforms` with per-platform strategies, replacing `linuxOnly`
- [x] macOS: a Homebrew base, Ollama on Metal, the Android SDK for mac, an Xcode
      check, and launchd instead of systemd
- [x] `iosRunnerMode: none | simulator | device`, plus `.circon/flows/ios.sh`
- [x] Linux and a USB iPhone: a Codemagic dev-client IPA, installed with
      `go-ios`, with WebDriverAgent for the UI hierarchy
- [ ] On real hardware: an Android emulator run on a Mac, a simulator run, and
      a USB iPhone on Linux. The flows parse and the web flow ran end to end
      locally, but no device flow has met a device yet
- [ ] The daily report on macOS (launchd calendar interval); it is Linux-only
      for now

**The constraint, written here so it is not re-derived:**
- The iOS Simulator is macOS-only.
- Running headless does not reduce rendering. It skips a window, not GPU work.
- A QEMU macOS VM has no Metal, and never touches the NVIDIA GPU.
- Apple has a documented open issue with the Simulator inside macOS VMs.
- baguette is Apple Silicon only, while Docker-OSX emulates Intel, so the two
  are mutually exclusive. Xcode 27 begins dropping Intel.

So iOS on Linux means a real device. A Mac running circon natively tests iOS
locally, without any SSH orchestration.

---

## 7. From working to good

The gate proves the app works. Nothing yet asks whether it is good to use, or
whether its security holds up across the whole codebase rather than a diff.
These items come after §0. They add mechanism on top of a loop no one has seen
finish a task.

- [x] The planner thinks about the product (onboarding, empty states, error
      copy). It puts ideas the owner did not ask for under `## Proposed
      additions` as a numbered list. `readTasks` never takes a task from that
      section, and `checkPrd` refuses `- [ ]` lines there
- [x] The build prompt has a UX self-check for UI tasks, and the reviewer
      flags user-facing gaps (unhandled states, text outside i18n, missing
      labels)
- [ ] Conventions repo: add `## Proposed additions` to `templates/PRD.md`
- [ ] **Missing-keys checklist before the run.** The control plane compares
      `.env.example` on the default branch with the project's secrets. The
      dashboard lists what is missing, with each comment as the instructions
      for getting it. The planner can name the external services up front
- [ ] **Design review, then polish.** Capture a screenshot of every route
      (Expo Router web export, `agent-device`). A multimodal reviewer looks at
      them, advisory only, in the same finding format as code review. When the
      PRD is complete, run up to `polishIterations` (default 0) on the findings,
      kept as generated tasks in `progress.json` and never in `PRD.md`, through
      the same gate. Screens behind auth need a Clerk testing token, so start
      with public routes
- [ ] **Whole-repo security audit**, a new `audit` role so it can be the
      strongest model or a second vendor. Run it once when all tasks are done:
      `requireRole` on every route, webhook signatures, secrets in the client
      bundle, validation at the `packages/shared` contract. Findings go in the
      PR and the release report

**Why the polish stays advisory:** screenshots are pixels, and the gate never
fails on pixels. A model's taste is input for the next iteration, just like the
code reviewer's notes. It is not a verdict.

**Why proposals are not tasks:** the owner approves the plan. An idea the
planner invented should cost money only after someone chose it.

**Why the build has to run without keys:** a missing key in the middle of a run
looks like a gate failure, and three of those trip the breaker. Real keys
matter for deploys and e2e against real services, not for building.

---

## Later

- **GitLab and other providers.** `integrations.provider` already exists. Keep
  `integrations/` provider-shaped.
- **One-click deploy** to Netlify, Vercel, GCP and AWS, and **managed hosting**
  per customer. Portable projects (§5) are the prerequisite.
- **Sync project secrets into GitHub Actions**, so CI can deploy without manual
  setup. This needs a libsodium sealed box and the `secrets:write` App
  permission.

---

## Done

- **Spend control:** per-run and per-day caps with a hard stop mid-run, a
  rolling ledger, cost shown in the report and the PR body, and refusing to start
  a run over the daily cap.
- **GitHub connection:** a GitHub App, with installation per org kept current by
  webhooks, a repo picker, and `integrations` → `projects` with plan limits.
  Clone, fetch and push go through `circon git-credential`, which mints a fresh
  repo-scoped token per request. That means no token is stored in a remote URL,
  and no SSH keys need to be authorized by hand.
- **Workspace:** one directory per project, `circon job <owner>__<repo>`, a
  branch per run (`circon/run-<date>-<id>`), and a PR when a run ends with
  commits, including a body and screenshots.
- **Control plane, phase 1:** `circon enroll`, a Durable Object per runner
  (state, heartbeat, a log ring buffer, a hibernating WebSocket), the Next.js
  dashboard with Clerk and D1, per-runner revocation, and stopping and queueing
  from the dashboard.
- **Runner daemon:** `circon agent` with reconnect and backoff, heartbeat, job
  claiming that respects the run lock, and a systemd unit enabled at enrollment.
- **The agent no longer edits the human's file:** task state lives in
  `.circon/progress.json`, and `PRD.md` is read-only to the agent.
- **Infrastructure failures vs gate failures:** a preflight per iteration, known
  failure signatures, retry with backoff, and no strike against the circuit
  breaker.
- **Automatic cleanup:** `circon gc` prunes logs and merged run branches, prunes
  the pnpm store above a threshold, and refuses to start below a disk floor.
- **Convention pinning:** a tagged conventions repo with `requires-cli`, and
  runners resolve the newest tag they can satisfy.
- **Credentials:** `circon config` and the context7 MCP. Credential files are
  loaded into the environment at CLI start.

---

## Decided against

**Docker.** Not the right axis. NVIDIA kernel modules, KVM, the Android emulator
and USB all need direct access to host hardware, which is the whole point of
this machine. A container with all of that mounted is a worse chroot. For
reproducible *machines*, the tool is cloud-init or Ansible.

**Telegram.** Dropped in favor of the dashboard. Two control surfaces means
neither one is trusted.

**`circon init` creates the GitHub repository.** In the intended flow, the user
connects a repository that already exists. The first job scaffolds into it
(§3).

**An encrypted local cache for config.** Config holds no secrets, so the
plaintext cache in `remote-config.json` is enough to keep a run going while the
control plane is unreachable. Secrets are never cached, by design (§4).

**Cloudflare Secrets Store for tenant secrets.** It is account-level and
quota-bound, built for the operator's own handful of secrets, not for one set
per customer project. Envelope encryption in D1 has no such ceiling.

**iOS modes `vm` and `mac`.** `vm` is ruled out by the constraint in §6. `mac`
meant writing an SSH transport to a Mac, which a native macOS runner makes
unnecessary.
