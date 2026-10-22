# First real run: runbook

This is TODO §0. Nobody has yet seen the loop finish a real PRD task on the box,
and everything else in the TODO assumes it can. This runbook takes about an hour
of your time. The agent works unattended for most of it.

**What it proves:**
1. The agent can finish a PRD task.
2. The gate catches a real regression.
3. A run ends with a reviewable PR.

## 0. Before you start

You need:
- the Ubuntu/NVIDIA box, provisioned and rebooted;
- an Anthropic API key;
- a GitHub repository you don't mind being written to, either empty or
  throwaway.

Check the machine first:

```bash
npm update -g @circon/cli      # or run from source, see the end of this file
circon doctor
```

Everything should read `ok`, apart from components you knowingly skipped.

Write down anything that isn't `ok`. A `missing` component is a finding even if
you can fix it in a minute, because it means `setup` did not converge.

## 1. Credentials

```bash
circon config                  # Anthropic API key at minimum
```

## 2. Create the project

```bash
circon init first-run          # answer "y" to the Expo client prompt
cd ~/Projects/first-run
cp <circon checkout>/examples/first-run/PRD.md PRD.md
cp <circon checkout>/examples/first-run/expected-web.txt .circon/expected-web.txt
git add -A && git commit -m "docs: first-run prd"
git remote add origin git@github.com:<you>/<throwaway>.git && git push -u origin main
```

The remote is what lets the run end in a pull request. Without it, the run still
works, but stops at a local branch.

## 3. Run it, small

```bash
circon run 5
```

Watch it, but don't intervene. In a second terminal you can run `circon status`
to see task progress, and `circon stop` to end the run cleanly between
iterations.

## 4. Break it on purpose

After at least one task has been committed:

```bash
sed -i 's/New item/New thing/' .circon/expected-web.txt   # a label the app does not have
circon run 2
```

The web gate must fail with `MISSING New thing`, and the iteration must be
reverted.

Then restore the line:

```bash
git checkout .circon/expected-web.txt
```

## 5. What to capture

Send these back. They are what decides whether TODO §0 is ticked.

| What | Where |
|---|---|
| Run logs | `~/.local/state/circon/logs/first-run-*.log` |
| Spend ledger | `~/.local/state/circon/spend.json` |
| The commits | `git log --oneline main..` on the run branch |
| The PR | its URL, or "no PR" and why |
| Task state | `circon status` |
| Anything that needed your hands | a sentence each |

Also answer these questions:

1. How many of the 5 tasks were completed in 5 iterations?
2. Did any iteration's commit message name the wrong task?
3. Did the web gate actually start Expo and read the accessibility tree? Look
   for `--- accessibility tree ---` in the log.
4. Did step 4 fail at the web tier and revert?
5. What did the whole run cost, and was any iteration unexpectedly expensive?
6. Did the circuit breaker or an infrastructure retry trigger? What was the
   cause?

## Success

These must hold:

- At least 2 tasks are committed and each passed the gate.
- Step 4 fails at the web tier, and the commit is reverted.
- The run ends with a pushed branch, plus a PR (or a stated reason why there is
  none).
- No step needed a manual fix to the machine.

Anything short of that is still a useful result. Write down where it stopped.

## Running from source instead of npm

```bash
git clone https://github.com/circon-io/circon && cd circon
corepack pnpm install
alias circon="node --experimental-strip-types $PWD/packages/cli/src/index.ts"
```
