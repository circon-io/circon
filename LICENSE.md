# Licensing

This repository is licensed per package, because the parts have different jobs.

| Package | License | Why |
|---|---|---|
| `packages/cli` (`@circon/cli`) | **MIT** | It runs on your machine with your API keys, your Cloudflare token and access to your repositories. Software that does that has to be readable, and it must keep working with no service behind it. |
| `packages/control-plane` | **FSL-1.1-ALv2** | Converts to Apache 2.0 after two years. |
| `packages/dashboard` | **FSL-1.1-ALv2** | Converts to Apache 2.0 after two years. |
| `init.sh`, templates, conventions | **MIT** | Part of what the CLI ships. |

## What the FSL allows

Everything except reselling this as a competing service. Specifically permitted:

- **Internal use**, commercial or not, in a company or personally
- Modifying it, self-hosting it, running it for your own products
- Non-commercial education and research
- Professional services you provide to someone else licensed under these terms

Not permitted: making the software available to others as a commercial product
or service that substitutes for it. That is the only thing being reserved.

Each version becomes Apache 2.0 two years after it is published, so nothing is
locked away permanently.

## Why the CLI is MIT and not FSL

The runner holds credentials and executes autonomously on someone's hardware.
Asking people to trust that without being able to read it, fork it, or run it
independently of any service is a worse trade than anything the license would
protect. It is also the part with no hosting business to defend — there is
nothing to compete with in a CLI that runs on your own machine.

*Not legal advice. If this becomes commercially material, have a lawyer read it.*
