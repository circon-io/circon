# Changesets

Every user-visible change ships with a changeset: `pnpm changeset`, pick the
packages, describe the change for users. The release workflow collects them
into one "version packages" pull request with the changelog; merging that PR —
or approving the release in the circon dashboard, which merges it — is what
ships to users.
