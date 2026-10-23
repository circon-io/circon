# Vision

What circon is for, so every decision can be checked against it. The TODO list is
for *how* and *when*; this file is for *what*, and changes rarely.

## One sentence

**circon takes an app from idea to production:** you describe what you want, an AI
plans it, and a machine you own builds, tests and ships it by our conventions.

## The flow

```
 dashboard                                 runner (your machine)
 ─────────                                 ─────────────────────
 1. connect a GitHub repository
 2. describe what to build
 3. AI writes the project plan  ◀─┐
 4. refine it, approve it  ───────┘
    → PRD.md committed to the repo
                                           5. install circon, enroll it
                                              (like a GitHub/GitLab runner)
                                              → converges the whole toolchain,
                                                then waits for work
 6. start the build  ─────────────────────▶ 7. scaffold by our conventions,
                                              loop: plan → build → gate → commit
 8. watch it live, review each PR  ◀──────── 9. open a PR per run, with
                                              screenshots, gate results, cost
10. approve the release  ─────────────────▶ 11. web → hosting, mobile → Codemagic
                                              → TestFlight / Play / stores
```

## Principles

**Your machine, your models.** The runner is hardware you control. We do not run
your code in our cloud. It can use local models (Ollama on the GPU) and the
coding-agent subscriptions you already pay for, both of which are much cheaper
than paying per token.

**Hybrid agents, chosen per role.** Planning, building and reviewing are separate
roles, and each can use a different backend and model. For example:
- plan with a strong reasoning model through Claude Code,
- build with Opus, or with a local model for the cheap parts,
- review with an OpenAI model through Codex, so a second vendor checks the first.

Supported backends are aider (with Ollama as the editor), Claude Code and OpenAI
Codex. Each can run on a subscription or an API key.

**Conventions are the product.** Every project is built the same way (stack,
monorepo layout, accessibility contract, CI/CD), as written in the conventions
repository. That sameness is what lets us:
- review agent output quickly,
- host every customer's project the same way,
- offer one-click deploys.

**Portable by construction.** Projects default to Cloudflare, but nothing outside
an adapter file may depend on it. The goal is a hosting choice per project
(Cloudflare, Netlify, Vercel, Google Cloud, AWS), and later managed hosting per
customer that we operate.

**The gate decides, not the agent.** Every iteration has to pass a tiered quality
gate before it is committed: typecheck → unit → web UI → Android UI → iOS UI.
The UI tiers drive the real app through its accessibility tree.

**Humans approve twice.** Gate 1 is merging a PR, which means "this code is
correct". Gate 2 is approving a release report, which means "this should go to
users now". The person who approves the release should never need to read a diff.

## What a generated project looks like

```
apps/mobile      Expo (iOS, Android, and web export). Includes the admin area,
                 role-gated, so there is no second UI codebase for management.
apps/web         Next.js, only when a marketing or SEO site is needed.
services/api     The server: Hono. Auth (Clerk JWT verification and role checks),
                 business logic, data access, webhooks and background jobs.
                 One adapter per hosting target.
packages/domain  Business logic as plain TypeScript, unit-tested.
packages/shared  Request/response contract shared by the clients and the API.
packages/ui      Design-system adapter (HeroUI / HeroUI Native).
```

The clients hold no secrets and enforce nothing. Every rule is enforced by
`services/api`.

## Testing matrix

| Runner OS | Web | Android | iOS |
|---|---|---|---|
| Linux (NVIDIA) | Expo web, accessibility tree | emulator (KVM) | USB device: unsigned dev-client IPA from Codemagic, signed for the phone and installed by xtool |
| macOS | Expo web, accessibility tree | emulator | simulator, or a USB device |

The reasons Linux cannot use the iOS simulator are recorded in [CLAUDE.md](CLAUDE.md).

## Publishing

- **Web and API:** GitHub Actions deploy to the project's hosting target.
- **Mobile:** Codemagic builds dev clients and store releases for both platforms.
  The release is triggered when the version PR merges.

## Not now

- GitLab and other repository providers. The integration layer is shaped for them.
- One-click deploys to hosts other than Cloudflare, and managed customer hosting.
  Projects are kept portable so these stay additions, not rewrites.
- Running untrusted third-party code on shared runners. A runner belongs to one
  organization.
