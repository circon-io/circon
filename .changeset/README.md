# Changesets

Every user-visible change ships with a changeset:

```bash
pnpm changeset
```

That writes a small markdown file describing the change and the version bump it
implies. CI turns pending changesets into a "Version Packages" PR; merging that
PR publishes to npm and writes the changelog. Never hand-edit `CHANGELOG.md`.
