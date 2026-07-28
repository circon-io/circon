# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A single Bash provisioning script (`init.sh`, ~1400 lines) that turns a fresh
Ubuntu install into an autonomous AI development machine. There is no build, no
test suite, no dependencies — the repo *is* the script.

Critically: **`init.sh` is a code generator.** Roughly half of it writes five
other executables into `/usr/local/bin` via heredocs. Editing those generated
scripts means editing heredoc bodies inside `init.sh`, with the escaping rules
below.

The target machine is Ubuntu with an NVIDIA GPU (RTX 3060 class). The author
develops from macOS and reaches the box over SSH and RDP.

## Verifying changes

There is nothing to run locally — `init.sh` only makes sense on a fresh Ubuntu
box. Verification is static plus fixture-driven:

```bash
# 1. The outer script
bash -n init.sh

# 2. Extract every generated script exactly as the heredocs emit it, then check
#    each one. ALWAYS do this after touching a heredoc — a broken quote inside
#    one is invisible to `bash -n init.sh`.
awk '/^sudo bash -c .cat << "EOF" > \/usr\/local\/bin\//{
       f=substr($0, index($0,"/usr/local/bin/"));
       gsub(/\/usr\/local\/bin\//,"",f); out="/tmp/gen/" f; next }
     f && /^EOF.$/ { f=""; next }
     f { print > out }' init.sh
for s in /tmp/gen/*; do bash -n "$s" || echo "BROKEN: $s"; done

# 3. No prompt may exist outside the step-0 configuration block
awk 'NR>115 && /^[^#]*\bread -/ {print "LEAK line "NR": "$0}' init.sh
```

For logic changes, drive the extracted function against fixtures rather than
reasoning about it. Pulling a single function out works well:

```bash
sed -n '/^run_gate() {/,/^}/p' /tmp/gen/ralph > /tmp/gate.sh
```

This is how the gate tiers, the credential prompts, and `solyd-verify` were
validated — every one of them surfaced a real bug that reading could not.

## Structure of init.sh

**Step 0 — configuration.** Every interactive prompt in the entire script lives
in the `configure()` function at the top: Anthropic API key, RDP credentials,
Telegram token. This is deliberate — the install takes ~30 minutes and must run
unattended after the questions. **Never add a prompt anywhere else.** Downstream
steps consume `CFG_*` variables.

Prompts are read from `/dev/tty` so `curl … | bash` works, with a defaults
fallback when no terminal exists. `sudo -v` plus a background keep-alive loop
prevents a password prompt from stalling the install mid-way.

**Steps 1–12** are numbered in their `echo` banners as `[n/12]`. Adding a step
means renumbering all of them:

```bash
perl -pi -e 's{\[(\d+)/12\]}{"[".$1."/13]"}ge' init.sh
```

Step 5 intentionally prints `[5/12]` twice (Android Studio, then headless SDK).

## Generated executables

| Script | Role |
|---|---|
| `ralph` | The autonomous loop. Runs aider against `PRD.md`, gated, committing per task. |
| `solyd-notify` | Sends a Telegram message. Silent no-op when unconfigured. |
| `solyd-daily-report` | 20:00 digest via a `systemd --user` timer. `--stdout` to preview. |
| `solyd-verify` | Claude Code review pass over the diff since the last pass. |
| `solyd-new-project` | Scaffolds a pnpm monorepo (apps/services/packages) wired to the gate. |

### The ralph loop

Per iteration: aider implements one PRD task → tiered gate → commit or revert.
Three exits (all reported to Telegram): PRD complete, circuit breaker after 3
consecutive failures, iteration limit reached.

Design decisions worth preserving:

- **Commits are named after the PRD task** that flipped `[ ]`→`[x]`, read from
  the staged diff. Without this every commit reads "completed automated task"
  and both the git log and the reports become useless.
- **Reports describe work, not counts** — commit subjects from
  `$START_COMMIT..HEAD` (this run only), plus the lines the agent appended to
  `progress.txt`, plus the failing tier's output.
- **Failure feeds forward.** `$LAST_FAILURE` and `$VERIFY_NOTES` are injected
  into the next aider prompt so it isn't retrying blind.

### The tiered gate (`run_gate`)

Cheapest signal first, stop at the first failure, `$GATE_TIER` names it:

1. `tsc --noEmit` — if `tsconfig.json` **and** `node_modules/.bin/tsc` exist
2. `pnpm test` (or `npm test`) — if `package.json` declares a `test` script.
   pnpm is used when `pnpm-workspace.yaml` or `pnpm-lock.yaml` is present.
3. `.solyd/flows/web.sh` — Expo web accessibility assertions
4. `.solyd/flows/android.sh` — same on the emulator, if a device is attached
5. `.solyd/flows/ios.sh` — if `IOS_RUNNER_MODE != none`

Every tier is opt-in by file presence, so a project with none of them behaves
exactly as before this existed. Preserve that property.

## Project layout on the target machine

`~/Projects` holds **one directory per project and nothing else**. Each project
is a pnpm workspace with `apps/` (clients), `services/` (backends) and
`packages/` (shared code) inside it.

This replaced an earlier top-level split by artifact type
(`apps/`, `servers/`, …), which was wrong: every project here spans both, so a
single repo would have had to live in two trees. Don't reintroduce it. `ralph`
runs at the project root next to `PRD.md`, which is exactly the monorepo root.

Consequences to keep in mind when editing:

- Flow scripts run from the **monorepo root**, not the client directory. They
  `cd` into `apps/mobile` (override via `.solyd/client-dir`).
- `web.sh` starts `services/api` before the client, otherwise the client renders
  its error state and the accessibility tree misrepresents what was built.
- The daily report prunes `node_modules` when scanning for `.git`, so a vendored
  repo never appears as a phantom project.

## Shared conventions vs. per-project specs

Two files, and the boundary between them matters:

- `~/AI-Workspace/ARCHITECTURE.md` — **how** to build. Standards true of every
  project: monorepo boundaries, the accessibility contract, TypeScript, APIs,
  secrets, and "never weaken a check to make it pass". Created once by step 8,
  guarded by `[ ! -f ]` so user edits survive re-running `init.sh`.
- `PRD.md` — **what** to build. Per project, nothing else.

Standards must not leak back into the PRD template; that's what caused the
duplication this replaced. The conventions reach the agents three ways:

| Consumer | Mechanism |
|---|---|
| aider (via `ralph`) | `--read` — read-only and prompt-cached, not re-paid per iteration |
| Claude Code (via `solyd-verify`) | `--append-system-prompt` |
| Interactive Claude Code | `@~/AI-Workspace/ARCHITECTURE.md` in the project `CLAUDE.md` |

Both `ralph` and `solyd-verify` also pick up an optional project-level
`.solyd/ARCHITECTURE.md`, loaded after the global one. In `ralph` these are
assembled into the `CONVENTION_FILES` array — it must stay safe to expand when
empty (`"${CONVENTION_FILES[@]}"` on an empty array must vanish, not become `""`).

## The UI feedback contract

The gate drives apps through the **accessibility tree**, never screenshots. An
element without `testID` and `accessibilityLabel` does not appear in the tree
and is therefore invisible to the agent — this is why the PRD template states
the contract and why the flow scripts assert on it.

`.solyd/expected-web.txt` lists labels that must be present; the flow fails if
any is missing. This is stronger than a lint rule: it proves the label reaches
the accessibility layer at runtime, and it also catches "the screen rendered
nothing".

`agent-device` refs (`@e2`) are **ephemeral** — they change after every command.
Flow scripts must match on labels, never on refs.

## iOS: what is and is not possible

Do not re-derive this. The iOS Simulator is macOS-only and these are settled:

- Headless does not reduce rendering — simulators still render, they just don't
  display. `simctl boot` skips a window, not GPU work.
- A QEMU macOS VM has no Metal and never touches the NVIDIA GPU (no macOS NVIDIA
  driver since Mojave). Zero VRAM contention with Ollama; all rendering falls to
  the CPU.
- Apple has a documented open issue with the iOS Simulator inside macOS VMs.
- `baguette` is Apple Silicon only; Docker-OSX emulates Intel. Mutually
  exclusive. Xcode 27 begins dropping Intel.

Conclusion encoded in the script: Loop 3 is a **pluggable stub** at
`~/.config/solyd/ios-runner.env` (`IOS_RUNNER_MODE=none|mac|device|vm`). Web and
Android feedback need no Apple hardware and cover most iterations.

## Heredoc escaping rules

Generated scripts are written as:

```bash
sudo bash -c 'cat << "EOF" > /usr/local/bin/name
...body...
EOF'
```

Two rules follow, and violating either produces a silently corrupt script:

1. **No raw `'` inside the body** — the outer `bash -c '…'` ends at the first
   one. Escape as `'\''` (see the aider `PROMPT` line) or, far better, write the
   body without apostrophes and use double quotes throughout.
2. **`<< "EOF"` is quoted**, so nothing expands — `$VAR`, `$(cmd)` and `\$4` are
   written literally and evaluate when the generated script runs. Anything the
   *outer* script must interpolate has to be written outside the heredoc.

Scaffold files under `~/AI-Workspace` are user-owned, so they use plain
`cat << 'EOF' > "$SCAFFOLD/…"` with no `sudo bash -c` wrapper — single quotes
are fine there.

## Bash gotchas already hit in this codebase

Each of these caused a real bug here; the fixes are in place, don't regress them.

- **`tr -dc … < /dev/urandom` needs `LC_ALL=C`.** Otherwise it fails with
  "Illegal byte sequence" in a UTF-8 locale and returns an **empty string** —
  this silently produced a blank RDP password.
- **`[ -r /dev/tty ]` is not enough.** `/dev/tty` can exist and be unreadable
  with no controlling terminal. Test by opening it: `{ : < /dev/tty; } 2>/dev/null`.
- **`read -n 1` leaves the newline in the buffer**, shifting every later answer
  by one under piped input. Don't use it for y/N prompts.
- **`wc -l` pads on BSD.** Pipe through `tr -d "[:space:]"` before arithmetic.
- **`$"\n"` is locale translation, not a newline.** Build multi-line strings with
  a literal newline inside double quotes, or an `add()` helper.
- **`grep -c` exits 1 on zero matches**, which kills the script under `set -e`.
  Append `|| true`.
- **`set -e` is active.** Long, optional, network-dependent work must live in a
  guarded function (`provision_android_sdk`, `provision_agent_tooling`) called as
  `if fn; then … else warn; fi`, so a failed download warns instead of aborting a
  30-minute install.
- **Background jobs print "Terminated"** into output the agent has to read.
  `disown` them.

## Version pinning

Prefer runtime resolution over hardcoded versions, which rot:

- Android command-line tools URL is scraped from the download page, with a
  known-good build as fallback.
- SDK platform and build-tools versions come from `sdkmanager --list`, sorted
  numerically (`sort -t- -k2 -n`, not lexically — otherwise `android-9` beats
  `android-36`) and filtered to digits so preview code names are excluded.

## Conventions

- Commit messages: `feat: <short lowercase summary>`, no body.
- Credentials go to `~/.config/solyd/*.env` at mode 600, never `~/.bashrc`
  (exception: `ANTHROPIC_API_KEY`, which every shell needs).
- Appends to `~/.bashrc` are guarded by a `grep` so re-running is idempotent.
- User-facing summaries at the end of `init.sh` are numbered next steps; keep
  them in sync when adding capabilities.
