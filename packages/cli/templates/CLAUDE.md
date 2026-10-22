# CLAUDE.md

@~/AI-Workspace/conventions/ARCHITECTURE.md

The engineering conventions imported above are the standing contract for every
circon project. Change them in the conventions repository, not here.

## This project

- `PRD.md` says what to build; only humans edit it. `progress.txt` is the
  agent's running log; task state lives in `.circon/progress.json`.
- `circon run` drives the autonomous loop from this directory. The gate lives in
  `.circon/flows/`, and `.circon/expected-web.txt` lists the accessibility
  labels the running app must expose.

## Layout

```
apps/mobile       Expo Router app: iOS, Android and the web, admin area included
services/api      Hono API: auth, business rules, data, webhooks
packages/domain   business logic as plain TypeScript, unit-tested
packages/shared   the API contract and typed client, used by both sides
packages/ui       the design-system adapter over HeroUI Native
packages/i18n     English and German strings
```

- **The API enforces everything.** The app holds no secrets and checks nothing
  that matters: every role check happens in `services/api` (`requireRole`).
- **Admin screens live in `apps/mobile/app/(admin)`**, behind a role check in
  their layout, and are backed by `/admin/*` routes that check the role again.
- **Portable by construction.** Only `services/api/src/adapters/` and
  `wrangler.jsonc` may know about the host. The schema is SQLite (Drizzle), so it
  runs on D1 and on libSQL alike.

## Commands

```bash
pnpm install
pnpm --filter @app/api dev        # API on :8787, local D1 migrated first
pnpm --filter @app/mobile web     # the app in a browser
pnpm test && pnpm typecheck
pnpm --filter @app/api db:generate   # after changing services/api/src/db/schema.ts
```

Add project-specific context below this line.
