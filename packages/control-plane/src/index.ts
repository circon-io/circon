import { type Env, fail, ok, nowIso } from './env.ts'
import {
  authenticateHumanDetailed, authenticateRunner, authFailureResponse, unauthorized, forbidden,
} from './auth.ts'
import { RunnerDO } from './runner-do.ts'
import {
  githubInstallUrl, githubCallback, githubWebhook, listIntegrations,
  listAvailableRepos, listProjects, createProject, deleteProject, cloneToken,
  runnerPullRequest,
} from './integrations/routes.ts'
import { entitlementFor, countRunners, hasFeature } from './billing/entitlements.ts'
import {
  belongsTo, enroll, createEnrollToken, listRunners, runnerConfig, commandRunner,
  getSettings, putSettings, putRunnerConfig, getProjectConfig, putProjectConfig,
  claimJob, queueJob, recordRun, listRuns, getRun,
} from './fleet.ts'
import { listPlans, getPlan, editPlan, streamPlan, approvePlan } from './planning/routes.ts'
import { createCheckout, createPortal, handleWebhook } from './billing/stripe.ts'
import { publicPlans, isPlanId } from './billing/plans.ts'

export { RunnerDO }

/**
 * The control plane.
 *
 * Deliberately a *view plus a job dispatcher*: conventions and PRDs live in
 * GitHub, so this never becomes a file server with its own conflict
 * resolution. What it does own is fleet state, queued work, per-runner config
 * and run history.
 */

function runnerStub(env: Env, runnerId: string) {
  return env.RUNNER.get(env.RUNNER.idFromName(runnerId))
}

/**
 * The dashboard is a separate Worker, so browser calls are cross-origin. Only
 * the configured dashboard origin is allowed; runners authenticate with bearer
 * tokens and are not subject to CORS at all.
 */
function corsHeaders(env: Env, request: Request): Record<string, string> {
  const origin = request.headers.get('origin')
  if (!origin || !env.DASHBOARD_ORIGIN || origin !== env.DASHBOARD_ORIGIN) return {}
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const cors = corsHeaders(env, request)
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }
    const response = await handle(request, env, ctx)
    // A 101 upgrade must be returned untouched or the socket never opens.
    if (response.status === 101) return response
    for (const [key, value] of Object.entries(cors)) response.headers.set(key, value)
    return response
  },
}

async function handle(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  {
    const url = new URL(request.url)
    const path = url.pathname

    try {
      // ---- runner endpoints -------------------------------------------------

      // Enrollment is the one unauthenticated route: the one-time token *is*
      // the credential, and it is consumed here.
      if (path === '/api/enroll' && request.method === 'POST') {
        return await enroll(request, env)
      }

      // Stripe cannot present a Clerk session, so the signature is the
      // authentication. Verified inside handleWebhook before anything is read.
      if (path === '/api/webhooks/stripe' && request.method === 'POST') {
        return await handleWebhook(request, env)
      }

      // Signature-authenticated, like Stripe's.
      if (path === '/api/webhooks/github' && request.method === 'POST') {
        return await githubWebhook(request, env)
      }

      // GitHub redirects the browser here after an install. `state` carries the
      // org, so no session is needed.
      if (path === '/api/integrations/github/callback') {
        return await githubCallback(request, env)
      }

      if (path === '/api/runner/socket') {
        const principal = await authenticateRunner(request, env)
        if (!principal) return unauthorized('Runner token rejected')
        const stub = runnerStub(env, principal.id)
        return stub.fetch(
          new Request(`https://do/socket?role=runner&runner=${encodeURIComponent(principal.id)}`, request),
        )
      }

      if (path === '/api/runner/config' && request.method === 'GET') {
        const principal = await authenticateRunner(request, env)
        if (!principal) return unauthorized()
        return await runnerConfig(env, principal.id, principal.org, url.searchParams.get('project'))
      }

      if (path === '/api/runner/claim' && request.method === 'POST') {
        const principal = await authenticateRunner(request, env)
        if (!principal) return unauthorized()
        return await claimJob(env, principal.id, principal.org)
      }

      if (path === '/api/runner/clone-token' && request.method === 'GET') {
        const principal = await authenticateRunner(request, env)
        if (!principal) return unauthorized()
        const slug = new URL(request.url).searchParams.get('project') ?? ''
        return await cloneToken(env, principal.org, slug)
      }

      if (path === '/api/runner/pull-request' && request.method === 'POST') {
        const principal = await authenticateRunner(request, env)
        if (!principal) return unauthorized()
        return await runnerPullRequest(request, env, principal.org)
      }

      if (path === '/api/runner/run' && request.method === 'POST') {
        const principal = await authenticateRunner(request, env)
        if (!principal) return unauthorized()
        return await recordRun(request, env, principal.id, principal.org)
      }

      // ---- dashboard endpoints ---------------------------------------------

      if (path.startsWith('/api/')) {
        const auth = await authenticateHumanDetailed(request, env)
        if (!auth.principal) return authFailureResponse(auth)
        const principal = auth.principal

        const segment = (n: number) => decodeURIComponent(path.split('/')[n] ?? '')

        if (path === '/api/runners' && request.method === 'GET') {
          return await listRunners(env, principal.org)
        }
        if (path === '/api/enroll-token' && request.method === 'POST') {
          return await createEnrollToken(request, env, principal.org, principal.id)
        }
        if (path === '/api/runs' && request.method === 'GET') {
          return await listRuns(env, principal.org, url)
        }
        if (/^\/api\/runs\/[^/]+$/.test(path) && request.method === 'GET') {
          return await getRun(env, principal.org, segment(3))
        }
        if (path === '/api/jobs' && request.method === 'POST') {
          return await queueJob(request, env, principal.org, principal.id)
        }
        if (path === '/api/settings' && request.method === 'GET') {
          return await getSettings(env, principal.org)
        }
        if (path === '/api/settings' && request.method === 'POST') {
          return await putSettings(request, env, principal.org, principal.id)
        }
        if (path === '/api/integrations' && request.method === 'GET') {
          return await listIntegrations(env, principal.org)
        }
        if (path === '/api/integrations/github/install-url' && request.method === 'GET') {
          return await githubInstallUrl(env, principal)
        }
        if (path.startsWith('/api/integrations/') && path.endsWith('/repos')) {
          return await listAvailableRepos(env, principal.org, segment(3))
        }
        if (path === '/api/projects' && request.method === 'GET') {
          return await listProjects(env, principal.org)
        }
        if (path === '/api/projects' && request.method === 'POST') {
          return await createProject(request, env, principal.org)
        }
        if (/^\/api\/projects\/[^/]+\/plans/.test(path)) {
          const projectId = segment(3)
          const rest = path.split('/').slice(5)
          if (rest.length === 0 && request.method === 'GET') return await listPlans(env, principal.org, projectId)
          if (rest.length === 0 && request.method === 'POST') {
            return await editPlan(request, env, principal.org, principal.id, projectId)
          }
          if (rest[0] === 'stream' && request.method === 'POST') {
            return await streamPlan(request, env, ctx, principal.org, principal.id, projectId)
          }
          const version = Number.parseInt(rest[0] ?? '', 10)
          if (Number.isInteger(version) && rest.length === 1 && request.method === 'GET') {
            return await getPlan(env, principal.org, projectId, version)
          }
          if (Number.isInteger(version) && rest[1] === 'approve' && request.method === 'POST') {
            return await approvePlan(env, principal.org, principal.id, projectId, version)
          }
        }
        if (/^\/api\/projects\/[^/]+\/config$/.test(path)) {
          if (request.method === 'GET') return await getProjectConfig(env, principal.org, segment(3))
          if (request.method === 'POST') return await putProjectConfig(request, env, principal.org, segment(3))
        }
        if (/^\/api\/projects\/[^/]+$/.test(path) && request.method === 'DELETE') {
          return await deleteProject(env, principal.org, segment(3))
        }
        if (path === '/api/billing' && request.method === 'GET') {
          return await billingSummary(env, principal.org)
        }
        if (path === '/api/billing/checkout' && request.method === 'POST') {
          const body = (await request.json().catch(() => ({}))) as {
            plan?: string
            returnTo?: string
          }
          if (!isPlanId(body.plan)) return fail('invalid_input', 'Unknown plan.')
          return await createCheckout(
            env,
            principal.org,
            principal.email,
            body.plan,
            body.returnTo ?? env.DASHBOARD_ORIGIN ?? '',
          )
        }
        if (path === '/api/billing/portal' && request.method === 'POST') {
          const body = (await request.json().catch(() => ({}))) as { returnTo?: string }
          return await createPortal(env, principal.org, body.returnTo ?? env.DASHBOARD_ORIGIN ?? '')
        }

        if (path.startsWith('/api/runners/')) {
          const runnerId = segment(3)
          if (!(await belongsTo(env, runnerId, principal.org))) return forbidden()

          if (path.endsWith('/logs') || path.endsWith('/watch')) {
            if (!(await hasFeature(env, principal.org, 'liveLogs'))) {
              return fail('feature_unavailable', 'Live logs are not part of your plan.', 402)
            }
            return path.endsWith('/logs')
              ? runnerStub(env, runnerId).fetch('https://do/logs')
              : runnerStub(env, runnerId).fetch(new Request('https://do/socket?role=observer', request))
          }
          if (path.endsWith('/command') && request.method === 'POST') {
            return await commandRunner(request, env, principal.org, runnerId)
          }
          if (path.endsWith('/config') && request.method === 'POST') {
            return await putRunnerConfig(request, env, principal.org, runnerId)
          }
          if (/^\/api\/runners\/[^/]+$/.test(path) && request.method === 'DELETE') {
            await env.DB.prepare('UPDATE runners SET revoked_at = ?1 WHERE id = ?2')
              .bind(nowIso(), runnerId)
              .run()
            return ok({ revoked: runnerId })
          }
        }

        return fail('not_found', `No route for ${request.method} ${path}`, 404)
      }

      return fail('not_found', 'This Worker serves the API only.', 404)
    } catch (error) {
      // Never leak an internal message to a client.
      console.error('unhandled', error)
      return fail('internal', 'Something went wrong.', 500)
    }
  }
}

// ---------------------------------------------------------------------------

async function billingSummary(env: Env, org: string): Promise<Response> {
  const { plan, tag, limits } = await entitlementFor(env, org)
  const runners = await countRunners(env, org)

  return ok({
    plan: { id: plan.id, name: plan.name, priceLabel: plan.priceLabel },
    status: tag.status ?? 'active',
    limits,
    usage: { runners },
    hasSubscription: Boolean(tag.stripeCustomerId),
    plans: publicPlans(),
  })
}
