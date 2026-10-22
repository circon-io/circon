/**
 * Every string on the site, in English. This file is the shape: `de.ts` is
 * typed against it, so a key or a list item missing from one language is a
 * type error, not a page that quietly differs.
 */
export const en = {
  meta: {
    title: 'circon: from idea to production, on a machine you own',
    shortTitle: 'From idea to production',
    description:
      'Describe your app, approve the AI-written plan, and your own runner builds, tests and ships it. Hybrid agents (Claude Code, Codex, aider with local models), a tiered quality gate and one pull request per run.',
    keywords: [
      'AI software development',
      'autonomous coding agent',
      'self-hosted AI runner',
      'Claude Code',
      'OpenAI Codex',
      'aider',
      'Ollama',
      'quality gate',
      'Expo',
      'React Native',
      'app development automation',
    ],
  },

  nav: {
    skip: 'Skip to content',
    how: 'How it works',
    gate: 'Quality gate',
    agents: 'Agents',
    runner: 'Runner',
    pricing: 'Pricing',
    faq: 'FAQ',
    github: 'GitHub',
    dashboard: 'Open dashboard',
    getStarted: 'Get started',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    language: 'Language',
    themeToLight: 'Switch to light mode',
    themeToDark: 'Switch to dark mode',
    home: 'circon home',
  },

  hero: {
    eyebrow: 'Your machine. Your models. Your conventions.',
    titleLead: 'From idea to production,',
    titleAccent: 'on a machine you own.',
    subtitle:
      'Describe the app. An AI writes the plan, you approve it, and your own runner builds, tests and ships it: one gated commit at a time, one pull request per run.',
    primary: 'Get started',
    secondary: 'View on GitHub',
    installLabel: 'Install the runner',
    copy: 'Copy',
    copied: 'Copied',
    installNote: 'Ubuntu with an NVIDIA GPU, or a Mac with Apple Silicon.',
  },

  console: {
    label: 'A run, live',
    branch: 'circon/run-2026-10-23-a1f3',
    tasksTitle: 'PRD.md',
    tasks: ['Sign-in screen with magic link', 'Order history with filters', 'Push notifications for status changes'],
    plan: 'Plan',
    build: 'Build',
    gate: 'Gate',
    commit: 'Commit',
    pr: 'Pull request',
    running: 'running',
    passed: 'passed',
    queued: 'queued',
    iteration: 'Iteration',
    cost: 'Cost',
    notional: 'subscription',
    prOpened: 'opened',
  },

  stats: [
    { value: '5', label: 'gate tiers, cheapest first' },
    { value: '3', label: 'agent roles, any vendor' },
    { value: '1', label: 'pull request per run' },
    { value: '0', label: 'lines of your code in our cloud' },
  ],

  flow: {
    eyebrow: 'How it works',
    title: 'You decide what. The runner does the rest.',
    subtitle:
      'Two people approve, a machine does the work in between. The dashboard is where you plan and review; the runner is where code gets written and tested.',
    dashboardLane: 'Dashboard',
    runnerLane: 'Your runner',
    steps: [
      {
        lane: 'dashboard',
        title: 'Connect a repository',
        body: 'Install the GitHub App on one repository. Access is granted per repository, tokens last an hour, and revoking it is uninstalling.',
      },
      {
        lane: 'dashboard',
        title: 'Describe what to build',
        body: 'A few sentences are enough. The planner thinks about the product and proposes ideas you accept or drop.',
      },
      {
        lane: 'dashboard',
        title: 'Approve the plan',
        body: 'Refine it until it is right. The approved plan is committed as PRD.md, and only humans ever edit it.',
      },
      {
        lane: 'runner',
        title: 'Enroll your machine',
        body: 'One command, like a CI runner. It installs the whole toolchain, then waits for work.',
      },
      {
        lane: 'runner',
        title: 'Build in a loop',
        body: 'Plan, build, gate, commit: one task per iteration, on its own branch, never on main.',
      },
      {
        lane: 'dashboard',
        title: 'Review and ship',
        body: 'Each run ends in one pull request with screenshots, gate results and cost. Approve the release and it ships.',
      },
    ],
  },

  gate: {
    eyebrow: 'Quality gate',
    title: 'The gate decides, not the agent.',
    subtitle:
      'Every iteration must pass a tiered gate before anything is committed. Cheapest first, stop at the first failure. The UI tiers drive the real app through its accessibility tree, not screenshots.',
    tiers: [
      { title: 'Typecheck', body: 'tsc across the workspace. Catches most broken edits before anything runs.', cost: 'seconds' },
      { title: 'Unit tests', body: 'The project’s own suite: business rules, API routes, validation.', cost: 'seconds' },
      { title: 'Web UI', body: 'Starts the API and the web app and fails on any missing accessibility label.', cost: 'a minute' },
      { title: 'Android UI', body: 'The real app on an emulator the runner boots itself.', cost: 'minutes' },
      { title: 'iOS UI', body: 'The simulator on a Mac runner, or a USB iPhone on Linux or macOS.', cost: 'minutes' },
    ],
    scenarioPass: 'All tiers green: committed',
    scenarioFail: 'Android failed: change reverted, the failure goes into the next prompt',
    committed: 'committed',
    reverted: 'reverted',
    breakerTitle: 'A loop that is stuck stops itself',
    breakerBody:
      'Three gate failures in a row trip a circuit breaker. Infrastructure trouble is retried with backoff, and spend caps stop a run before they are exceeded.',
    reviewTitle: 'A second pair of eyes, every five iterations',
    reviewBody: 'A reviewer reads the accumulated diff for correctness and security. Its findings go into the next prompt.',
  },

  agents: {
    eyebrow: 'Hybrid agents',
    title: 'The right model for each role.',
    subtitle:
      'Planning, building and reviewing are separate roles, and each can use a different agent and model. Let one vendor check another, and keep the cheap parts on a local model.',
    roles: [
      { title: 'Plan', body: 'A strong reasoning model breaks the next task down before any code is written.' },
      { title: 'Build', body: 'Writes exactly one task from the plan. Never commits; only the gate does.' },
      { title: 'Review', body: 'A second model, ideally from another vendor, reviews the diff.' },
    ],
    hub: 'circon run',
    points: [
      {
        title: 'Your subscriptions, not just API keys',
        body: 'Claude Code and Codex run on the plans you already pay for. That usage is recorded but never counts against your caps.',
      },
      {
        title: 'A usage limit is a pause, not a failure',
        body: 'When a subscription window runs out, the loop discards the partial edit and waits for the reset.',
      },
      {
        title: 'Local models on your GPU',
        body: 'aider with Ollama does the cheap edits on your NVIDIA card or Apple Silicon. No per-token bill.',
      },
    ],
  },

  runner: {
    eyebrow: 'Your machine, your models',
    title: 'One command turns a box into a runner.',
    subtitle:
      'The runner is hardware you control, like a self-hosted CI runner. We never run your code in our cloud; the hosted part only coordinates projects, jobs and live logs.',
    points: [
      {
        title: 'Safe to re-run',
        body: 'Setup probes the real system and installs only what is missing. It never downloads a model twice or duplicates a config line.',
      },
      {
        title: 'Adopts, never clobbers',
        body: 'Node from nvm or Docker from your distro is left alone. Upgrades happen only when you ask for them.',
      },
      {
        title: 'Linux or Mac',
        body: 'Ubuntu with an NVIDIA GPU, or Apple Silicon with Ollama on Metal. Web and Android need no Apple hardware.',
      },
      {
        title: 'Stops cleanly',
        body: 'One run at a time. A stop lands between iterations, never in the middle of a commit.',
      },
    ],
    terminalTitle: 'runner — zsh',
  },

  conventions: {
    eyebrow: 'Conventions are the product',
    title: 'Every project is built the same way.',
    subtitle:
      'Stack, monorepo layout, accessibility contract and CI/CD are written down once in a conventions repository, and every agent reads it. That sameness makes agent output quick to review and every project easy to host.',
    tree: [
      { path: 'apps/mobile', note: 'Expo: iOS, Android and web, admin included' },
      { path: 'apps/web', note: 'Next.js, only when SEO needs it' },
      { path: 'services/api', note: 'Hono: auth, business logic, webhooks' },
      { path: 'packages/domain', note: 'Business rules in plain TypeScript' },
      { path: 'packages/shared', note: 'The contract between clients and API' },
      { path: 'packages/ui', note: 'HeroUI and HeroUI Native' },
      { path: 'PRD.md', note: 'What to build. Only humans edit it.' },
    ],
    points: [
      { title: 'Portable by construction', body: 'Cloudflare by default, but only an adapter file may depend on it.' },
      { title: 'Pinned per run', body: 'Conventions never change mid-run. They are the contract.' },
      { title: 'Versioned in git', body: 'Editing a convention is a commit. Every runner picks it up on the next update.' },
    ],
  },

  approve: {
    eyebrow: 'Humans approve twice',
    title: 'You stay in charge of what ships.',
    gates: [
      {
        label: 'Gate 1',
        title: 'Merge the pull request',
        body: 'This code is correct. Each run is one PR on its own branch, with screenshots, gate results and cost attached.',
      },
      {
        label: 'Gate 2',
        title: 'Approve the release',
        body: 'This should reach users now. Web goes to hosting, mobile through Codemagic to TestFlight and Google Play. Nobody has to read a diff.',
      },
    ],
  },

  pricing: {
    eyebrow: 'Pricing',
    title: 'Start free on one machine.',
    subtitle:
      'The CLI is open source under the MIT license. You pay your AI providers directly, or use subscriptions you already have.',
    plans: [
      {
        name: 'Basic',
        price: 'Free',
        description: 'For one project on one runner.',
        cta: 'Start for free',
        features: ['1 runner', '1 project', '10 plan generations', 'Live logs and job queue', '7 days of run history'],
      },
      {
        name: 'Pro',
        price: 'Subscription',
        description: 'For teams running several projects in parallel.',
        cta: 'Upgrade in the dashboard',
        features: ['10 runners', '10 projects', '100 plan generations', 'iOS runners', '90 days of run history', 'Priority support'],
      },
    ],
    recommended: 'For teams',
  },

  faq: {
    eyebrow: 'FAQ',
    title: 'Questions, answered.',
    items: [
      {
        q: 'What is circon?',
        a: 'circon takes an app from idea to production. You describe what you want in the dashboard, an AI writes the project plan, and after you approve it a runner on your own machine builds, tests and ships the app, following a shared set of engineering conventions.',
      },
      {
        q: 'Does my code run in your cloud?',
        a: 'No. The runner is a machine you own, enrolled like a self-hosted CI runner. The hosted control plane only coordinates projects, jobs, live logs and billing. Your code is cloned to and built on your hardware.',
      },
      {
        q: 'Which AI agents and models are supported?',
        a: 'aider (with a local Ollama model as the editor), Claude Code and OpenAI Codex. Planning, building and reviewing are separate roles, and each can use a different agent and model, on a subscription or an API key.',
      },
      {
        q: 'What hardware does a runner need?',
        a: 'Ubuntu 24.04 or newer with an NVIDIA GPU, or a Mac with Apple Silicon. Web and Android testing work on both. iOS testing uses the simulator on a Mac, or a USB-connected iPhone on Linux or macOS.',
      },
      {
        q: 'What kind of apps does it build?',
        a: 'Full-stack TypeScript apps: an Expo client for iOS, Android and web, a Hono API, shared business logic, and Next.js when a marketing site is needed, all in one pnpm monorepo deployed to Cloudflare by default.',
      },
      {
        q: 'How does it stop an agent from breaking things?',
        a: 'Agents never commit. Every change must pass a tiered quality gate (typecheck, unit tests, web, Android and iOS UI) or it is reverted. Each run works on its own branch and ends in a pull request a human merges. A circuit breaker and spend caps stop a loop that is not making progress.',
      },
      {
        q: 'What does it cost?',
        a: 'The CLI is free and open source under the MIT license. The hosted dashboard has a free Basic plan with one runner and a Pro plan for more. AI usage is billed by your providers, or covered by subscriptions you already have, with per-run and per-day caps you set.',
      },
    ],
  },

  cta: {
    title: 'Your next app, built while you sleep.',
    subtitle: 'Install the runner in one command, connect a repository and describe what you want.',
    primary: 'Open the dashboard',
    secondary: 'Read the docs',
  },

  footer: {
    tagline: 'From idea to production, on a machine you own.',
    product: 'Product',
    resources: 'Resources',
    legal: 'Legal',
    imprint: 'Imprint',
    privacy: 'Privacy policy',
    source: 'Source code',
    docs: 'Setup guide',
    license: 'CLI under MIT. Control plane and dashboard under FSL-1.1-ALv2.',
    rights: 'All rights reserved.',
  },

  legal: {
    updated: 'Last updated',
    back: 'Back to home',
    breadcrumbHome: 'Home',
  },
} as const

type Widen<T> = T extends string
  ? string
  : T extends readonly unknown[]
    ? { readonly [K in keyof T]: Widen<T[K]> }
    : { readonly [K in keyof T]: Widen<T[K]> }

/** The shape every language must match: same keys, same list lengths, any text. */
export type Dictionary = Widen<typeof en>
