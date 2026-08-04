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
| `CLERK_SECRET_KEY` | Clerk → API Keys → Secret key (`sk_live_…`) |
| `RUNNER_SECRET_PEPPER` | Generate yourself: `openssl rand -hex 32`. Peppers runner-token hashes; **changing it invalidates every enrolled runner**, so treat it as permanent. |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys → Secret key (`sk_live_…`) |
| `STRIPE_WEBHOOK_SECRET` | Created in step 5 below (`whsec_…`) |

`GITHUB_TOKEN` is injected automatically. **Do not create one.**

`CLERK_SECRET_KEY` and `RUNNER_SECRET_PEPPER` are **required** —
the deploy fails loudly if any is empty, rather than shipping a Worker that
answers every request with "not configured". The two Stripe secrets are optional;
without them the billing endpoints return 503 and everything else works.

There is deliberately **no `NPM_TOKEN`** — npm publishing uses OIDC trusted
publishing (step 6).

## 3. Repository variables

**Settings → Secrets and variables → Actions → Variables**

Variables are plain text and readable by anyone with repo access. Publishable
keys and account ids belong here, not in secrets, so they can be diffed.

| Variable | Value |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare → Workers & Pages → Account ID |
| `CLERK_JWKS_URL` | `https://<your-clerk-frontend-api>/.well-known/jwks.json` — Clerk → Configure → API Keys → Show JWT public key. **A variable, not a secret**: it is a well-known endpoint serving public keys. |
| `CLERK_ISSUER` | The origin of that same host, no path |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk → API Keys → Publishable key (`pk_live_…`) |
| `STRIPE_PRICE_PRO` | The Pro price id from step 5 (`price_…`) |
| `CONTROL_PLANE_DOMAIN` | Hostname for the API Worker, e.g. `api.circon.io`. Zone must be on Cloudflare. |
| `DASHBOARD_DOMAIN` | Hostname for the dashboard, e.g. `app.circon.io` |
| `CONTROL_PLANE_URL` | `https://<CONTROL_PLANE_DOMAIN>` |
| `DASHBOARD_ORIGIN` | `https://<DASHBOARD_DOMAIN>` |

### Domains

Both Workers deploy to hostnames you choose rather than `workers.dev` —
`workers_dev` is `false` in both `wrangler.jsonc`, and the hostname is passed as
`--domain` at deploy time.

Requirements:

- The **zone must already be on Cloudflare** (nameservers pointed at it). The
  hostname itself does not need to exist — attaching a Custom Domain creates the
  DNS record for you.
- `CONTROL_PLANE_URL` and `DASHBOARD_ORIGIN` are just `https://` plus the
  corresponding domain. They are application config — the API uses
  `DASHBOARD_ORIGIN` for CORS, the dashboard uses `CONTROL_PLANE_URL` to know
  where to call. **They do not configure routing**; `--domain` does that.

Because you choose the hostnames up front, all four values are known before the
first deploy and no second pass is needed.

If you would rather use `workers.dev` after all, set `workers_dev` back to
`true`, drop the `--domain` flags, and register a subdomain at
**Workers & Pages → your account → Register subdomain** first.

## 4. Repository permissions

**Settings → Actions → General → Workflow permissions**

- **Read and write permissions**
- Tick **Allow GitHub Actions to create and approve pull requests**

Changesets needs the second one to open the "Version Packages" PR. Because
`circon-io` is an organization, both may be locked at
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

### Register a workers.dev subdomain — once, before the first deploy

**Workers & Pages → Register subdomain**, or
`https://dash.cloudflare.com/<account-id>/workers/onboarding`

Pick any name. It will not be used — both Workers set `workers_dev: false` and
deploy to your own domains — but **the account must still have one**, or every
deploy fails with:

```
You need a workers.dev subdomain in order to proceed [code: 10063]
```

This is an account-level prerequisite, not something the config can satisfy. It
catches people out precisely because `workers_dev: false` reads like it should
make the requirement go away.

### Everything else

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

Custom domains need zone-level permissions as well:

| Permission | Level | Why |
|---|---|---|
| **Workers Routes** · Edit | Zone | Attaches the Worker to the hostname |
| **DNS** · Edit | Zone | A Custom Domain creates the proxied DNS record |
| **Zone** · Read | Zone | Resolves the zone the hostname belongs to |

**Account Resources** → include only the one account.
**Zone Resources** → include only the zone your domains live on.

Deliberately absent: **KV**, **R2** and **Queues** — nothing declares a binding
for any of them, so granting them widens the blast radius for nothing. If a
deploy ever fails with a permissions error, add the one permission it names
rather than reaching for the template.

---

## Checklist

```
[ ] GitHub environment `production` with required reviewers
[ ] 5 secrets  (CLOUDFLARE_API_TOKEN, CLERK_SECRET_KEY, RUNNER_SECRET_PEPPER,
                STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET)
[ ] 9 variables (CLOUDFLARE_ACCOUNT_ID, CLERK_JWKS_URL, CLERK_ISSUER,
                 NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, STRIPE_PRICE_PRO,
                 CONTROL_PLANE_DOMAIN, DASHBOARD_DOMAIN,
                 CONTROL_PLANE_URL, DASHBOARD_ORIGIN)
[ ] Zone on Cloudflare, token has zone-level Workers Routes/DNS/Zone perms
[ ] workers.dev subdomain registered on the account (required even when unused)
[ ] Workflow permissions: read/write + allow PR creation
[ ] Stripe product, price, webhook endpoint
[ ] npm: manual first publish, then trusted publisher
[ ] Clerk: organizations enabled
```

## Not this repository

`packages/cli/templates/SECRETS.md` documents what a *scaffolded project*
needs. Those are the end user's credentials, not yours.
