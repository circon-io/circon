# Secrets, variables and settings

What this project's pipelines need, and where each value goes. When the project
is built by circon, the dashboard's project secrets cover the runner; these are
for GitHub Actions and Codemagic.

**Secrets** are encrypted and masked in logs. **Variables** are plain text,
readable by anyone with repo access: publishable keys and account ids go there.

## GitHub: protect `main` (gate 1)

**Settings → Branches → Add rule for `main`**: require a pull request, and
require the `CI / check` status. Merging a PR is then the statement "this code
is correct", and nothing reaches `main` around the checks. circon's plan
approvals open a PR when the branch is protected, which is the point.

## GitHub: environment `production`

**Settings → Environments → production**. Required reviewers are optional here:
the release approval (gate 2) is merging the version PR, which the circon
dashboard's release report does for you.

| Secret | Where to get it |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens. Scoped to this project's account: Workers Scripts, D1 and Pages edit. Never a global key. |
| `CLERK_WEBHOOK_SECRET` | Clerk → Webhooks → add `<API_URL>/webhooks/clerk` → Signing secret (`whsec_…`) |
| `CODEMAGIC_API_TOKEN` | Codemagic → Team settings → Integrations → Codemagic API |
| `SENTRY_AUTH_TOKEN` | Sentry → Settings → Auth Tokens (`project:releases`) |

| Variable | Value |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare → Workers & Pages → Account ID |
| `CLERK_JWKS_URL` | Clerk → API Keys → JWKS URL |
| `CLERK_ISSUER` | Clerk → API Keys → Frontend API URL |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk → API Keys → Publishable key |
| `API_URL` | Where the API is served, e.g. `https://__PROJECT_NAME__-api.<you>.workers.dev` |
| `APP_ORIGIN` | Where the web app is served, e.g. `https://__PROJECT_NAME__.pages.dev` |
| `CODEMAGIC_APP_ID` | Codemagic → the app → the id in its URL |

## Codemagic

See the top of `codemagic.yaml`: an App Store Connect API key named `codemagic`,
an Android keystore named `upload_keystore`, and the `app_env` and
`google_play` variable groups. Register test-device UDIDs before building the
dev client; a phone added later needs a new build.

## Local development

Copy `.env.example` to `.env` for the app, and the API's values to
`services/api/.dev.vars` for `wrangler dev`. Both are gitignored.

There is no `NPM_TOKEN`: nothing here publishes to npm.
