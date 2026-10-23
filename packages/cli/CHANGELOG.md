# @circon/cli

## 0.3.0

### Minor Changes

- b135392: Agent backends per role (aider, Claude Code, Codex) on subscriptions or API keys; live run streaming and layered config from the dashboard; scaffolding a connected repository on its first run; a portable project template (Hono API, Drizzle on SQLite, one Expo app with its admin area, Codemagic and Changesets); booting the Android emulator for the gate.
- bb51541: A USB iPhone on a Linux runner no longer needs a provisioned build: xtool signs the dev client and WebDriverAgent for the phone on the cable, from an App Store Connect key set in `circon config`. The Codemagic dev-client build is now unsigned, and WebDriverAgent is downloaded by `circon setup` instead of built by hand.

## 0.2.0

### Minor Changes

- 8429568: Replace the monolithic bash provisioning script with a TypeScript CLI.

  - `circon doctor` / `circon setup` converge the machine idempotently; components
    probe the real system, so re-running never re-downloads the model and never
    installs over software another manager owns (`foreign` status).
  - `circon run` ports the agent loop with the tiered quality gate, committing to
    `circon/work` so human PRD edits on `main` cannot collide with agent output.
  - `circon stop` halts between iterations, never mid-commit.
  - Zero runtime dependencies.
