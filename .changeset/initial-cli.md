---
"@circon/cli": minor
---

Replace the monolithic bash provisioning script with a TypeScript CLI.

- `circon doctor` / `circon setup` converge the machine idempotently; components
  probe the real system, so re-running never re-downloads the model and never
  installs over software another manager owns (`foreign` status).
- `circon run` ports the agent loop with the tiered quality gate, committing to
  `circon/work` so human PRD edits on `main` cannot collide with agent output.
- `circon stop` halts between iterations, never mid-commit.
- Zero runtime dependencies.
