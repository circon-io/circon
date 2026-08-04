# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Two things with very different change rates, deliberately separated:

- **`init.sh`** (~88 lines) — a bootstrap. Installs Node and `@circon/cli`, and
  nothing else. It should stay this small.
- **`packages/cli`** — `@circon/cli`, a zero-runtime-dependency TypeScript CLI
  that converges the machine, runs the agent loop, and reports on it.

It used to be one 1851-line bash script that generated five more bash scripts
through 20 heredocs. That script could not be re-run (`snap install` aborted it
under `set -e`), appended duplicate lines to `/etc/sysctl.conf` every run, and
could only be updated by reprovisioning. The split is the fix.

Target machine: Ubuntu with an NVIDIA GPU. The author develops from macOS over
SSH and RDP.

## Commands

```bash
pnpm install
pnpm --filter @circon/cli build       # tsc → dist/
pnpm --filter @circon/cli typecheck
pnpm --filter @circon/cli test        # node:test, runs .ts directly
bash -n init.sh                       # the bootstrap must still parse

# One test file, or one test by name
cd packages/cli
node --test --experimental-strip-types src/agent/gate.test.ts
node --test --test-name-pattern='short-circuit' --experimental-strip-types 'src/**/*.test.ts'

# Drive the CLI from source without building
node --experimental-strip-types src/index.ts doctor
```

Node 24 runs TypeScript directly, so tests need no build step. The published
package is still compiled, because Node 22.12 needs a flag for type stripping.

## Architecture

### The component model is the point

`src/components/*.ts`. Everything installable implements `Component`:

```ts
check(): Promise<'ok' | 'missing' | 'outdated' | 'foreign'>
install(): Promise<void>
```

- `doctor` runs every `check()` and changes nothing
- `setup` calls `install()` **only** where `check()` said `missing`
- `outdated` requires an explicit `setup --upgrade` — an `npm update -g` must
  never silently move Android API 36 → 37 mid-project
- `foreign` means present but not ours (Node via nvm, Docker from the distro).
  **Adopt, don't clobber**: `setup` leaves these strictly alone.

Two invariants worth protecting:

1. **`check()` probes the real system, never a cached marker.** `ollama list |
   grep qwen2.5-coder` is what stops a multi-gigabyte re-download. The
   `versions.json` lockfile is a record, never an input to a decision.
2. **`doctor` and `setup --dry-run` have no side effects.** `ensureDirs()` runs
   only after the dry-run bail in `commands/setup.ts` — it was above it once,
   and dry-run created directories.

`registry.ts` declares install order; `validateOrdering()` fails the test suite
if a `requires` names something unknown or declared later.

### The agent loop

`src/agent/` and `commands/run.ts`.

- **`gate.ts`** — the tiered quality gate: typecheck → unit → web → android →
  ios, cheapest first, stop at the first failure. Every tier is opt-in by file
  presence, so a project with none behaves like a bare `npm test`. **Preserve
  that.** Dependencies are injected so the tiers are testable without a
  toolchain; `gate.test.ts` is the parity record against the old bash version.
- **`git.ts`** — the agent commits to `circon/work`, never the default branch.
  That is what makes the loop's `reset --hard` safe: it can only ever discard
  the agent's own work. Human PRD edits land on `main` and are merged in at run
  start.
- **`lock.ts`** — one run at a time, PID-based so a lock left by a killed
  process is reclaimed. `stop` writes a flag checked **between iterations**, so
  a stop never lands mid-commit.
- **Single pull point.** Conventions and the PRD are inputs to a run, fetched
  once at start, never mid-loop where they would race the agent's commits.

### The GitHub connection

A project *is* a connected repository. `org` (Clerk, holds the plan) →
`integration` (one GitHub App installation) → `project` (one repository from it).
Three levels because one installation covers many repositories.

A **GitHub App**, not OAuth and not a PAT: grants are per-repository, tokens last
an hour, and revoking access is uninstalling. Two credentials, easy to confuse —
the **app JWT** (RS256, 10 min, identifies the App, only ever used to mint the
next thing) and the **installation token** (1 hr, scoped to one repository, does
the actual work).

Two things here are not obvious and cost real debugging:

0. **The four settings are prefixed `GH_`, not `GITHUB_`.** Actions reserves the
   `GITHUB_` prefix for both secrets and variables, so `GITHUB_APP_ID` is rejected
   at creation time. The Worker reads the same `GH_` names, so one grep finds every
   use. Unrelated: `GH_TOKEN`/`GITHUB_TOKEN` in `review.ts` are `gh`'s own
   documented variables and are not part of this naming.
1. **The private key must be PKCS#8.** GitHub issues PKCS#1 (`BEGIN RSA PRIVATE
   KEY`); WebCrypto imports only PKCS#8. `pemToDer` detects this and returns the
   `openssl pkcs8 -topk8` command, because the alternative is an inscrutable
   `importKey` failure.
2. **Never put the token in the remote URL.** It persists in `.git/config` and it
   expires in an hour, so the *second* iteration's push fails with a bare 403 long
   after the URL was written. Instead git calls back into the CLI —
   `circon git-credential` answers git's credential protocol with a fresh token
   per request. This needs `credential.useHttpPath=true`; without it git omits the
   path and the helper cannot tell which repository is being asked about.

`slugFor()` in the control plane and `isValidSlug()` in the CLI must agree: the
slug `owner__repo` is a directory name on the runner *and* is split back into
owner and repo to mint a token. A name containing `__` cannot round-trip, so it is
refused at connect time rather than resolved by guessing.

### Conventions live in git

`~/AI-Workspace/conventions` is a clone. `ARCHITECTURE.md` reaches the agents
three ways: aider gets it via `--read` (read-only and prompt-cached, so it is
not re-paid every iteration), the review pass appends it to Claude Code's system
prompt, and each project's `CLAUDE.md` imports it. Editing a convention is a
commit, and every machine picks it up on the next `circon update`.

## Conventions in this repo

- **Zero runtime dependencies.** `node:util` provides `parseArgs` and
  `styleText`; `node:readline/promises` provides prompts. Keep it that way.
- Imports use `.ts` extensions; `rewriteRelativeImportExtensions` emits `.js`.
- `run()` in `core/exec.ts` never throws on non-zero exit — callers decide what
  failure means, which is what lets `check()` probe freely.
- **`pnpm run <script>`, never `pnpm <script>`**, when the script name collides
  with a pnpm built-in — `deploy`, `publish`, `link`, `prune`, `update`, `add`,
  `setup`, `list` and others. `pnpm deploy` runs pnpm's own deploy command and
  fails with `ERR_PNPM_NOTHING_TO_DEPLOY`; the script is never reached.
- **American English everywhere** — identifiers, comments, docs and UI strings.
  `enrollment` not `enrolment`, `organization` not `organisation`, `behavior`
  not `behaviour`, `-ize` not `-ise`. The repo previously had both spellings of
  `enroll` in *identifiers* (`enroll_tokens` beside `Enrolment`), which made the
  concept ungreppable.
- Commit messages: `feat: <short lowercase summary>`, no body.
- Credentials go to `~/.config/circon/*.env` at mode 0600, never `~/.bashrc`.

## Bash gotchas — still governs init.sh and the flow templates

`packages/cli/templates/.circon/flows/*.sh` are shell, and `init.sh` is shell.
These each caused a real bug here:

- **`tr -dc … < /dev/urandom` needs `LC_ALL=C`.** Otherwise it fails with
  "Illegal byte sequence" in a UTF-8 locale and returns an **empty string**.
- **`[ -r /dev/tty ]` is not enough** — it can exist and be unreadable. Test by
  opening it: `{ : < /dev/tty; } 2>/dev/null`.
- **`read -n 1` leaves the newline in the buffer**, shifting every later answer
  under piped input.
- **`wc -l` pads on BSD.** Pipe through `tr -d "[:space:]"` before arithmetic.
- **`grep -c` exits 1 on zero matches**, which kills a script under `set -e`.
- **Background jobs print "Terminated"** into output the agent reads. Reap them
  with `wait`; `disown` alone does not suppress it.

## The iOS constraint

Do not re-derive this. The iOS Simulator is macOS-only:

- Headless does not reduce rendering — simulators still render, they just don't
  display. `simctl boot` skips a window, not GPU work.
- A QEMU macOS VM has no Metal and never touches the NVIDIA GPU (no macOS NVIDIA
  driver since Mojave). All rendering falls to the CPU.
- Apple has a documented open issue with the Simulator inside macOS VMs.
- baguette is Apple Silicon only; Docker-OSX emulates Intel. Mutually exclusive,
  and Xcode 27 begins dropping Intel.

So iOS is a pluggable stub: `iosRunnerMode` in `~/.config/circon/config.json`
(`none | mac | device | vm`). Web and Android feedback need no Apple hardware.
