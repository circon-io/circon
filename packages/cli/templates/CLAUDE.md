# CLAUDE.md

@~/AI-Workspace/conventions/ARCHITECTURE.md

The engineering conventions imported above are shared by every project on this
machine and are the standing contract. Edit them in the conventions repository,
not here.

## This project

- `PRD.md` is the task backlog. `progress.txt` is the running log.
- Layout: `apps/` clients, `services/` backends, `packages/` shared code.
- `circon run` drives the autonomous loop from this directory.
- The gate lives in `.circon/flows/`. `.circon/expected-web.txt` lists the
  accessibility labels the running app must expose.

Add project-specific context below this line.
