/**
 * The dashboard.
 *
 * Deliberately a single dependency-free module served from the same Worker as
 * the API: one origin, no CORS, no build step, and nothing to keep in sync with
 * the backend. When it outgrows this it becomes the Next.js app the stack
 * already specifies — the API does not change either way.
 *
 * Clerk is loaded from its CDN rather than bundled, for the same reason.
 */

const CLERK_PUBLISHABLE_KEY = document.body.dataset.clerkKey ?? ''

const state = {
  runners: [],
  runs: [],
  spentLast24h: 0,
  /** runnerId -> { socket, lines[] } for the log panels currently open. */
  watching: new Map(),
  signedIn: false,
}

// --- session ---------------------------------------------------------------

let clerk = null

async function getToken() {
  if (clerk?.session) return clerk.session.getToken()
  // Escape hatch for local development against `wrangler dev`, where standing
  // up Clerk is more ceremony than the thing being tested.
  return localStorage.getItem('circon_dev_token') ?? ''
}

async function initAuth() {
  if (!CLERK_PUBLISHABLE_KEY) {
    state.signedIn = Boolean(localStorage.getItem('circon_dev_token'))
    return
  }
  await new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = `https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js`
    script.crossOrigin = 'anonymous'
    script.dataset.clerkPublishableKey = CLERK_PUBLISHABLE_KEY
    script.addEventListener('load', resolve)
    script.addEventListener('error', resolve)
    document.head.appendChild(script)
  })

  if (!window.Clerk) return
  clerk = window.Clerk
  await clerk.load()
  state.signedIn = Boolean(clerk.user)

  if (!state.signedIn) {
    clerk.mountSignIn(el('#signin'))
  } else {
    clerk.mountUserButton(el('#userbutton'))
  }
}

// --- tiny helpers ----------------------------------------------------------

const el = (sel, root = document) => root.querySelector(sel)
const els = (sel, root = document) => [...root.querySelectorAll(sel)]

function h(tag, attrs = {}, children = []) {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value
    else if (key === 'text') node.textContent = value
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value)
    else if (value !== null && value !== undefined) node.setAttribute(key, String(value))
  }
  for (const child of [children].flat()) {
    if (child) node.append(child instanceof Node ? child : document.createTextNode(String(child)))
  }
  return node
}

const money = (n) => `$${Number(n ?? 0).toFixed(2)}`

function ago(iso) {
  if (!iso) return 'never'
  const secs = Math.round((Date.now() - Date.parse(iso)) / 1000)
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`
  if (secs < 86400) return `${Math.round(secs / 3600)}h ago`
  return `${Math.round(secs / 86400)}d ago`
}

async function api(path, init = {}) {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      authorization: `Bearer ${await getToken()}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
  })
  const body = await res.json().catch(() => ({}))
  if (res.status === 401) {
    state.signedIn = false
    throw new Error('Not signed in')
  }
  if (!body.ok) throw new Error(body.error?.message ?? `Request failed (${res.status})`)
  return body.data
}

function toast(message, kind = 'info') {
  const node = h('div', { class: `toast ${kind}`, text: message })
  el('#toasts').append(node)
  setTimeout(() => node.remove(), 6000)
}

// --- runners ---------------------------------------------------------------

function runnerCard(runner) {
  const s = runner.state ?? { status: 'offline' }
  const busy = s.status === 'running'

  const detail = busy
    ? `${s.project ?? '—'}${s.iteration ? ` · iteration ${s.iteration}` : ''} · ${money(s.costUsd)}`
    : `last seen ${ago(runner.last_seen_at ?? s.lastSeenAt)}`

  const logPanel = h('pre', { class: 'log', 'data-log': runner.id, hidden: 'hidden' })

  return h('article', { class: `runner ${s.status}` }, [
    h('header', {}, [
      h('span', { class: 'dot' }),
      h('span', { class: 'name', text: runner.name }),
      h('span', { class: 'badge', text: s.status }),
      h('span', { class: 'meta', text: detail }),
      h('span', { class: 'spacer' }),
      busy
        ? h('button', {
            class: 'danger',
            text: 'Stop',
            onclick: () => stopRunner(runner.id),
          })
        : null,
      h('button', {
        text: 'Live logs',
        onclick: (e) => toggleWatch(runner.id, logPanel, e.target),
      }),
      h('button', {
        class: 'ghost',
        text: 'Revoke',
        onclick: () => revokeRunner(runner.id, runner.name),
      }),
    ]),
    h('div', { class: 'sub meta', text: `${runner.platform ?? 'unknown'} · CLI ${runner.cli_version ?? '?'}` }),
    logPanel,
  ])
}

async function stopRunner(id) {
  await api(`/api/runners/${id}/command`, {
    method: 'POST',
    body: JSON.stringify({ type: 'command', command: 'stop' }),
  })
  toast('Stop requested — the loop ends after this iteration.', 'ok')
}

async function revokeRunner(id, name) {
  if (!confirm(`Revoke "${name}"? Its token stops working immediately.`)) return
  await api(`/api/runners/${id}`, { method: 'DELETE' })
  toast(`Revoked ${name}.`, 'ok')
  await refresh()
}

/**
 * Live logs over the Durable Object's socket.
 *
 * This is what the DO exists for — polling would miss lines and cost a request
 * per second per viewer.
 */
async function toggleWatch(runnerId, panel, button) {
  const open = state.watching.get(runnerId)
  if (open) {
    open.socket.close()
    state.watching.delete(runnerId)
    panel.hidden = true
    button.textContent = 'Live logs'
    return
  }

  // Seed with history so the panel is not empty until the next line arrives.
  panel.hidden = false
  panel.textContent = 'Connecting…'
  button.textContent = 'Stop watching'

  try {
    const res = await fetch(`/api/runners/${runnerId}/logs`, {
      headers: { authorization: `Bearer ${await getToken()}` },
    })
    const body = await res.json()
    panel.textContent = (body.lines ?? []).join('\n') || '(no output yet)'
    panel.scrollTop = panel.scrollHeight
  } catch {
    panel.textContent = '(could not load history)'
  }

  const url = new URL(`/api/runners/${runnerId}/watch`, location.href)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('token', await getToken())

  const socket = new WebSocket(url)
  socket.addEventListener('message', (event) => {
    let message
    try {
      message = JSON.parse(event.data)
    } catch {
      return
    }
    if (message.type === 'log') {
      panel.textContent += `\n${message.lines.join('\n')}`
      panel.scrollTop = panel.scrollHeight
    }
    if (message.type === 'state') refresh()
  })
  socket.addEventListener('close', () => {
    if (state.watching.has(runnerId)) panel.textContent += '\n(disconnected)'
  })

  state.watching.set(runnerId, { socket })
}

// --- adding a runner -------------------------------------------------------

async function createEnrolToken() {
  const name = el('#runner-name').value.trim()
  const data = await api('/api/enroll-token', {
    method: 'POST',
    body: JSON.stringify(name ? { name } : {}),
  })

  const origin = location.origin
  el('#enrol-result').hidden = false
  el('#enrol-command').textContent =
    `circon enroll --url ${origin} --token ${data.token}`
  el('#enrol-expiry').textContent =
    `Single use, expires in ${data.ttlMinutes} minutes.`
}

// --- jobs ------------------------------------------------------------------

async function queueJob(event) {
  event.preventDefault()
  const slug = el('#job-slug').value.trim()
  const maxLoops = Number.parseInt(el('#job-loops').value, 10) || 20
  if (!slug) return

  await api('/api/jobs', { method: 'POST', body: JSON.stringify({ projectSlug: slug, maxLoops }) })
  toast(`Queued ${slug}. The next idle runner will claim it.`, 'ok')
  el('#job-slug').value = ''
}

// --- runs ------------------------------------------------------------------

function runRow(run) {
  const outcome = run.outcome ?? 'running'
  return h('tr', { class: `outcome-${outcome}` }, [
    h('td', { text: run.project_slug }),
    h('td', {}, [h('span', { class: `badge ${outcome}`, text: outcome })]),
    h('td', { text: String(run.commits ?? 0) }),
    h('td', { text: money(run.cost_usd) }),
    h('td', { text: ago(run.started_at) }),
    h('td', {}, [
      run.pr_url
        ? h('a', { href: run.pr_url, target: '_blank', rel: 'noreferrer', text: 'PR' })
        : run.failed_tier
          ? h('span', { class: 'meta', text: `failed: ${run.failed_tier}` })
          : h('span', { class: 'meta', text: '—' }),
    ]),
  ])
}

// --- render ----------------------------------------------------------------

function render() {
  el('#signin-wrap').hidden = state.signedIn
  el('#app').hidden = !state.signedIn
  if (!state.signedIn) return

  const online = state.runners.filter((r) => r.state?.status !== 'offline').length
  el('#summary').textContent =
    `${state.runners.length} runner${state.runners.length === 1 ? '' : 's'}, ` +
    `${online} online · ${money(state.spentLast24h)} in the last 24h`

  const host = el('#runners')
  host.replaceChildren(
    ...(state.runners.length
      ? state.runners.map(runnerCard)
      : [
          h('div', { class: 'empty' }, [
            'No runners yet. Create an enrolment token below, then run that command on the machine.',
          ]),
        ]),
  )

  const tbody = el('#runs tbody')
  tbody.replaceChildren(
    ...(state.runs.length
      ? state.runs.map(runRow)
      : [h('tr', {}, [h('td', { colspan: '6', class: 'meta', text: 'No runs recorded yet.' })])]),
  )
}

async function refresh() {
  if (!state.signedIn) return
  try {
    const [runners, runs] = await Promise.all([api('/api/runners'), api('/api/runs?limit=25')])
    state.runners = runners.runners ?? []
    state.runs = runs.runs ?? []
    state.spentLast24h = runs.spentLast24h ?? 0
    render()
  } catch (error) {
    if (error.message !== 'Not signed in') toast(error.message, 'error')
    render()
  }
}

// --- boot ------------------------------------------------------------------

async function main() {
  await initAuth()
  el('#enrol-form').addEventListener('submit', (e) => {
    e.preventDefault()
    createEnrolToken().catch((error) => toast(error.message, 'error'))
  })
  el('#job-form').addEventListener('submit', (e) => {
    queueJob(e).catch((error) => toast(error.message, 'error'))
  })
  els('[data-copy]').forEach((button) =>
    button.addEventListener('click', () => {
      navigator.clipboard.writeText(el(button.dataset.copy).textContent ?? '')
      toast('Copied.', 'ok')
    }),
  )

  await refresh()
  // The per-runner socket carries live logs; this only keeps the list and the
  // cost figure current, so a slow interval is plenty.
  setInterval(refresh, 5000)
}

main()
