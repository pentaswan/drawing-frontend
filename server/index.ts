import './env.ts'
import { serve } from '@hono/node-server'
import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import { generateGlobalChat } from './chat/generate.ts'
import {
  getPublishedSite,
  publishSite,
  tryGetPublishedSite,
  type PublishedElement,
} from './publish/store.ts'
import {
  createSessionId,
  deployBackend,
  invokeSandbox,
  listRoutes,
  resetSandbox,
} from './sandbox/manager.ts'
import { getVisionProvider, listProviderIds } from './vision/registry.ts'
import type { GenerateRequest, GlobalChatRequest } from './vision/types.ts'

function envPresent(name: string): boolean {
  return Boolean(process.env[name]?.trim())
}

function providerDiagnostics() {
  return {
    perceptron: {
      apiKey: envPresent('PERCEPTRON_API_KEY'),
      model: process.env.PERCEPTRON_MODEL || 'perceptron-mk1.5',
    },
    openai: {
      apiKey: envPresent('OPENAI_API_KEY'),
      model: process.env.OPENAI_MODEL || 'gpt-4o',
    },
    anthropic: {
      apiKey: envPresent('ANTHROPIC_API_KEY'),
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
    },
    grok: {
      apiKey: envPresent('XAI_API_KEY') || envPresent('GROK_API_KEY'),
      model: process.env.GROK_MODEL || process.env.XAI_MODEL || 'grok-4.7',
    },
  }
}

async function maybeDeployBackend(
  sessionId: string | undefined,
  backend: Parameters<typeof deployBackend>[0]['routes'] | undefined,
) {
  if (!sessionId || !backend || backend.length === 0) {
    return undefined
  }
  return deployBackend({ sessionId, routes: backend })
}

const app = new Hono()

app.use(
  '/api/*',
  cors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  }),
)

app.get('/api/health', (c) =>
  c.json({
    ok: true,
    defaultProvider: process.env.VISION_PROVIDER || 'perceptron',
    providers: listProviderIds(),
    env: providerDiagnostics(),
  }),
)

app.get('/api/providers', (c) =>
  c.json({
    defaultProvider: process.env.VISION_PROVIDER || 'perceptron',
    providers: listProviderIds(),
    env: providerDiagnostics(),
  }),
)

app.post('/api/session', (c) => {
  const sessionId = createSessionId()
  return c.json({
    sessionId,
    apiBase: `/api/u/${sessionId}`,
  })
})

app.get('/api/session/:sessionId/routes', (c) => {
  try {
    const sessionId = c.req.param('sessionId')
    return c.json({
      sessionId,
      routes: listRoutes(sessionId),
      apiBase: `/api/u/${sessionId}`,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid session'
    return c.json({ error: message }, 400)
  }
})

app.delete('/api/session/:sessionId', (c) => {
  try {
    const sessionId = c.req.param('sessionId')
    resetSandbox(sessionId)
    return c.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid session'
    return c.json({ error: message }, 400)
  }
})

app.post('/api/generate', async (c) => {
  try {
    const body = (await c.req.json()) as GenerateRequest
    if (!body?.imageBase64 || !Array.isArray(body.groups) || body.groups.length === 0) {
      return c.json(
        { error: 'imageBase64 and at least one labeled group are required' },
        400,
      )
    }
    if (
      typeof body.pageWidth !== 'number' ||
      typeof body.pageHeight !== 'number' ||
      body.pageWidth <= 0 ||
      body.pageHeight <= 0
    ) {
      return c.json({ error: 'pageWidth and pageHeight must be positive numbers' }, 400)
    }

    const provider = getVisionProvider(body.provider)
    const result = await provider.generate(body)
    const sandbox = await maybeDeployBackend(body.sessionId, result.backend)
    return c.json({ ...result, provider: provider.id, sandbox })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Generate failed'
    console.error('[generate]', message)
    return c.json({ error: message }, 500)
  }
})

app.post('/api/global-chat', async (c) => {
  try {
    const body = (await c.req.json()) as GlobalChatRequest
    if (!body?.message?.trim()) {
      return c.json({ error: 'message is required' }, 400)
    }

    const result = await generateGlobalChat(body)
    const sandbox = await maybeDeployBackend(body.sessionId, result.backend)
    return c.json({ ...result, sandbox })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Global chat failed'
    console.error('[global-chat]', message)
    return c.json({ error: message }, 500)
  }
})

app.post('/api/sandbox/deploy', async (c) => {
  try {
    const body = (await c.req.json()) as {
      sessionId?: string
      routes?: Parameters<typeof deployBackend>[0]['routes']
    }
    if (!body.sessionId || !Array.isArray(body.routes)) {
      return c.json({ error: 'sessionId and routes are required' }, 400)
    }
    const sandbox = await deployBackend({
      sessionId: body.sessionId,
      routes: body.routes,
    })
    return c.json(sandbox)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Deploy failed'
    console.error('[sandbox/deploy]', message)
    return c.json({ error: message }, 500)
  }
})

async function proxySandbox(c: Context, sessionId: string, prefix: string) {
  const url = new URL(c.req.url)
  let routePath = url.pathname.slice(prefix.length) || '/'
  if (!routePath.startsWith('/')) routePath = `/${routePath}`

  const query: Record<string, string> = {}
  url.searchParams.forEach((value, key) => {
    query[key] = value
  })

  let body: unknown = null
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    const contentType = c.req.header('content-type') || ''
    if (contentType.includes('application/json')) {
      try {
        body = await c.req.json()
      } catch {
        body = null
      }
    } else {
      body = await c.req.text()
    }
  }

  const headers: Record<string, string> = {}
  for (const [key, value] of c.req.raw.headers.entries()) {
    if (key === 'host' || key === 'cookie') continue
    headers[key] = value
  }

  const result = await invokeSandbox({
    sessionId,
    method: c.req.method,
    routePath,
    query,
    headers,
    body,
  })

  const responseHeaders = new Headers()
  for (const [key, value] of Object.entries(result.headers)) {
    responseHeaders.set(key, value)
  }

  const isJson =
    (result.headers['content-type'] || '').includes('application/json') ||
    typeof result.body === 'object'
  return new Response(
    isJson ? JSON.stringify(result.body) : String(result.body ?? ''),
    { status: result.status, headers: responseHeaders },
  )
}

app.post('/api/publish', async (c) => {
  try {
    const body = (await c.req.json()) as {
      slug?: string
      title?: string
      pageCss?: string
      elements?: PublishedElement[]
      sessionId?: string
    }
    if (!body.slug?.trim() || !body.sessionId) {
      return c.json({ error: 'slug and sessionId are required' }, 400)
    }
    if (!Array.isArray(body.elements)) {
      return c.json({ error: 'elements must be an array' }, 400)
    }

    const site = publishSite({
      slug: body.slug,
      title: body.title,
      pageCss: body.pageCss || '',
      elements: body.elements,
      sourceSessionId: body.sessionId,
    })

    return c.json({
      ...site,
      urlPath: `/${site.slug}`,
      apiBase: `/api/p/${site.slug}`,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Publish failed'
    console.error('[publish]', message)
    return c.json({ error: message }, 400)
  }
})

app.get('/api/sites/:slug', (c) => {
  try {
    const site = getPublishedSite(c.req.param('slug'))
    if (!site) {
      return c.json({ error: 'Site not found' }, 404)
    }
    return c.json({
      ...site,
      urlPath: `/${site.slug}`,
      apiBase: `/api/p/${site.slug}`,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid slug'
    return c.json({ error: message }, 400)
  }
})

/** Published-site sandbox API: /api/p/:slug/* */
app.all('/api/p/:slug/*', async (c) => {
  try {
    const slug = c.req.param('slug')
    const site = tryGetPublishedSite(slug)
    if (!site) {
      return c.json({ error: 'Site not found' }, 404)
    }
    return await proxySandbox(c, site.sandboxSessionId, `/api/p/${site.slug}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sandbox error'
    console.error('[published-sandbox]', message)
    return c.json({ error: message }, 500)
  }
})

/** Per-user sandbox API: /api/u/:sessionId/* */
app.all('/api/u/:sessionId/*', async (c) => {
  try {
    const sessionId = c.req.param('sessionId')
    return await proxySandbox(c, sessionId, `/api/u/${sessionId}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sandbox error'
    console.error('[sandbox]', message)
    return c.json({ error: message }, 500)
  }
})

const port = Number(process.env.PORT || 3001)

serve({ fetch: app.fetch, port }, () => {
  console.log(`API listening on http://localhost:${port}`)
})
