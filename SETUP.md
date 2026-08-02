# Deployment setup

Everything to configure before the workflows work. Roughly 30 minutes.

## 1. GitHub environment

**Settings → Environments → New environment → `production`**

All three deploy workflows target it. **Add required reviewers** — that turns
every deploy into an approval gate, which is the release gate without needing
the dashboard to provide one.

## 2. Repository secrets

**Settings → Secrets and variables → Actions → Secrets**

| Secret | Where to get it |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → **Create Custom Token**. Three permissions only — see [Cloudflare API token](#cloudflare-api-token) below. Never a Global API Key. |
| `CLERK_JWKS_URL` | `https://<your-clerk-domain>/.well-known/jwks.json` — Clerk → Configure → API Keys → Show JWT public key |
| `CLERK_SECRET_KEY` | Clerk → API Keys → Secret key (`sk_live_…`) |
| `RUNNER_SECRET_PEPPER` | Generate yourself: `openssl rand -hex 32`. Peppers runner-token hashes; **changing it invalidates every enrolled runner**, so treat it as permanent. |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys → Secret key (`sk_live_…`) |
| `STRIPE_WEBHOOK_SECRET` | Created in step 5 below (`whsec_…`) |

`GITHUB_TOKEN` is injected automatically. **Do not create one.**

There is deliberately **no `NPM_TOKEN`** — npm publishing uses OIDC trusted
publishing (step 6).

## 3. Repository variables

**Settings → Secrets and variables → Actions → Variables**

Variables are plain text and readable by anyone with repo access. Publishable
keys and account ids belong here, not in secrets, so they can be diffed.

| Variable | Value |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare → Workers & Pages → Account ID |
| `CLERK_ISSUER` | `https://<your-clerk-domain>` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk → API Keys → Publishable key (`pk_live_…`) |
| `STRIPE_PRICE_PRO` | The Pro price id from step 5 (`price_…`) |
| `CONTROL_PLANE_URL` | The API Worker's URL — **see the ordering note** |
| `DASHBOARD_ORIGIN` | The dashboard Worker's URL — **see the ordering note** |

### ⚠️ The ordering problem

`CONTROL_PLANE_URL` and `DASHBOARD_ORIGIN` are each other's deployed URLs, so
neither is known before the first deploy. Deploying is therefore two passes:

1. Set both to empty strings and run **Deploy control plane** and
   **Deploy dashboard**.
2. Read the two `*.workers.dev` URLs from the run output.
3. Set the real values and re-run both.

Until pass 2, the dashboard cannot reach the API and CORS rejects it. This is
expected, not a misconfiguration.

## 4. Repository permissions

**Settings → Actions → General → Workflow permissions**

- **Read and write permissions**
- Tick **Allow GitHub Actions to create and approve pull requests**

Changesets needs the second one to open the "Version Packages" PR. Because
`circon-io` is an organisation, both may be locked at
`https://github.com/organizations/circon-io/settings/actions` — the repo-level
control is greyed out until the org allows it.

## 5. Stripe

1. **Product** → create one, e.g. "circon Pro".
2. **Price** → recurring, monthly. Copy the `price_…` id into `STRIPE_PRICE_PRO`.
3. **Webhook** → Developers → Webhooks → Add endpoint:
   - URL: `<CONTROL_PLANE_URL>/api/webhooks/stripe`
   - Events: `checkout.session.completed`, `customer.subscription.created`,
     `customer.subscription.updated`, `customer.subscription.deleted`
   - Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

Test and live mode have **different price ids**. `planForPrice` matches the
configured id exactly and returns `null` on a mismatch rather than guessing, so
a test-mode id in live config leaves paying customers on the free plan. Check
which mode you copied from.

## 6. npm (publishing the CLI)

Trusted publishing is configured on the *package*, so the package must exist
first. That makes the first publish manual — and the only one:

```bash
cd packages/cli && npm login && npm publish --access public
```

Then **npmjs.com → @circon/cli → Settings → Trusted Publisher**:

| Field | Value |
|---|---|
| Organization | `circon-io` |
| Repository | `circon` |
| Workflow filename | `release.yml` — **the filename only, not a path** |
| Environment | `production` — must match `release.yml` exactly |
| Allowed actions | `npm publish` |

A path instead of a filename, or an environment set on one side and blank on the
other, both surface as a bare `E404` on publish rather than an auth error.

## 7. Clerk

1. Create the application.
2. **Enable Organizations** (Configure → Organizations). Entitlements are keyed
   on the org; a personal account falls back to the user id.
3. Copy the publishable key, secret key and JWKS URL into the values above.
4. Nothing else — billing metadata is written by the Stripe webhook.

## 8. Cloudflare

Nothing to create by hand. The deploy workflow creates the D1 database if it is
absent and adopts it if it exists; Durable Objects, assets and bindings are all
declared in `wrangler.jsonc`.

### Cloudflare API token

Use **Create Custom Token**, not the "Edit Cloudflare Workers" template — that
template grants KV, R2 and Workers Routes on every zone, none of which this
project touches.

| Permission | Level | Why |
|---|---|---|
| **Workers Scripts** · Edit | Account | `wrangler deploy`, `wrangler secret put`, and the static assets upload. Durable Objects are part of the script, so they need no separate grant. |
| **D1** · Edit | Account | `d1 list`, `d1 create`, `d1 migrations apply`. Edit implies read. |
| **Account Settings** · Read | Account | Wrangler validates the account before deploying. |

**Account Resources** → include only the one account.
**Zone Resources** → none. Both Workers publish to `*.workers.dev`; a custom
domain would add **Workers Routes · Edit** on that zone alone.

Deliberately absent: **KV**, **R2** and **Queues** — nothing declares a binding
for any of them, so granting them widens the blast radius for nothing. If a
deploy ever fails with a permissions error, add the one permission it names
rather than reaching for the template.

---

## Checklist

```
[ ] GitHub environment `production` with required reviewers
[ ] 6 secrets  (CLOUDFLARE_API_TOKEN, CLERK_JWKS_URL, CLERK_SECRET_KEY,
                RUNNER_SECRET_PEPPER, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET)
[ ] 6 variables (CLOUDFLARE_ACCOUNT_ID, CLERK_ISSUER,
                 NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, STRIPE_PRICE_PRO,
                 CONTROL_PLANE_URL, DASHBOARD_ORIGIN)
[ ] Workflow permissions: read/write + allow PR creation
[ ] Stripe product, price, webhook endpoint
[ ] npm: manual first publish, then trusted publisher
[ ] Clerk: organizations enabled
[ ] Deploy twice — the URL variables are unknown until after the first pass
```

## Not this repository

`packages/cli/templates/SECRETS.md` documents what a *scaffolded project*
needs. Those are the end user's credentials, not yours.
