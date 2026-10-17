import './env.ts'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getVisionProvider, listProviderIds } from './vision/registry.ts'
import type { GenerateRequest } from './vision/types.ts'

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
    return c.json({ ...result, provider: provider.id })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Generate failed'
    console.error('[generate]', message)
    return c.json({ error: message }, 500)
  }
})

const port = Number(process.env.PORT || 3001)

serve({ fetch: app.fetch, port }, () => {
  console.log(`API listening on http://localhost:${port}`)
})
