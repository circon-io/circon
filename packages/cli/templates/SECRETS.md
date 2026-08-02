# Repository secrets and variables

What this project's GitHub Actions need, and where each value goes.

**Secrets** are encrypted and masked in logs. **Variables** are plain text and
readable by anyone with repo access — publishable keys and account IDs belong
there, not in secrets, so they can be seen and diffed.

## Environments

Create these under **Settings → Environments**:

| Environment | Used by | Protection |
|---|---|---|
| `production` | `deploy.yml` | **Add required reviewers.** This is the release approval gate: the deploy pauses until someone approves. |
| `preview` | optional, for PR deploys | none |

A GitHub Environment with required reviewers gives you approval-before-release
natively — no dashboard required for it.

## Secrets

| Name | Scope | Where to get it |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | production | Cloudflare → My Profile → API Tokens. **Scope it to this project's account and only the resources it needs** — never a global key. |
| `CLERK_SECRET_KEY` | production | Clerk dashboard → API Keys → Secret key |
| `SENTRY_AUTH_TOKEN` | production | Sentry → Settings → Auth Tokens (`project:releases` is enough) |
| `CODEMAGIC_API_TOKEN` | production | Codemagic → Teams → Integrations → API token |

## Variables

| Name | Value |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → Workers → Account ID |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk → API Keys → Publishable key |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry → Project Settings → Client Keys (DSN) |
| `CODEMAGIC_APP_ID` | Codemagic → the app → its URL contains the id |

## Local development

Copy `.env.example` to `.env` and fill the same values. `.env` is gitignored;
never commit it.

## What is deliberately absent

There is no `NPM_TOKEN`. Nothing here publishes to npm — and where publishing
does happen, OIDC trusted publishing replaces the token entirely.
