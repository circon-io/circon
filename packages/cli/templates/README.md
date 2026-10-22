# __PROJECT_NAME__

Built with [circon](https://github.com/circon-io/circon): an AI agent builds it
task by task from `PRD.md`, and every change passes a quality gate before it is
committed.

```bash
pnpm install
pnpm --filter @app/api dev       # the API, with a local database
pnpm --filter @app/mobile web    # the app in a browser (or: ios, android)
```

- What it does and what is planned: [PRD.md](PRD.md)
- How it is built: [CLAUDE.md](CLAUDE.md)
- Credentials and deploy setup: [SECRETS.md](SECRETS.md)

Releases: every user-visible change carries a changeset (`pnpm changeset`). The
release workflow keeps a "version packages" PR open; merging it deploys the API
and web app and starts the store builds.
