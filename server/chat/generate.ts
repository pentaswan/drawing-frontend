import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import {
  buildGlobalSystemPrompt,
  buildGlobalUserPrompt,
  jsonShapeHint,
} from '../vision/prompt.ts'
import { OPERATIONS_JSON_SCHEMA, parseOperationsJson } from '../vision/schema.ts'
import type { GenerateResponse, GlobalChatRequest } from '../vision/types.ts'
import { getVisionProvider } from '../vision/registry.ts'

function extractAnthropicText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim()
}

async function generateWithOpenAICompatible(args: {
  label: string
  apiKey: string
  model: string
  baseURL?: string
  req: GlobalChatRequest
}): Promise<GenerateResponse> {
  console.log(`[${args.label}/global] Using model ${args.model}`)
  const client = new OpenAI({
    apiKey: args.apiKey,
    baseURL: args.baseURL,
    timeout: 360_000,
  })

  const response = await client.chat.completions.create({
    model: args.model,
    messages: [
      { role: 'system', content: buildGlobalSystemPrompt() },
      {
        role: 'user',
        content: buildGlobalUserPrompt({
          message: args.req.message,
          existingElements: args.req.existingElements,
          existingHtml: args.req.existingHtml,
          pageCss: args.req.pageCss,
        }),
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'page_operations',
        strict: true,
        schema: OPERATIONS_JSON_SCHEMA,
      },
    },
    max_completion_tokens: 4096,
  })

  const content = response.choices[0]?.message?.content
  if (!content) {
    throw new Error(`${args.label} returned an empty response`)
  }
  return parseOperationsJson(content)
}

async function generateWithAnthropic(
  req: GlobalChatRequest,
): Promise<GenerateResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  const model =
    process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-20250514'
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')

  console.log(`[anthropic/global] Using model ${model}`)
  const client = new Anthropic({ apiKey })
  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: [
      buildGlobalSystemPrompt(),
      'You may use web_search for current public facts or URLs needed by the request.',
      'After any searches, respond with a single JSON object only (no markdown fences).',
    ].join(' '),
    tools: [
      {
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 5,
      },
    ],
    messages: [
      {
        role: 'user',
        content: `${buildGlobalUserPrompt({
          message: req.message,
          existingElements: req.existingElements,
          existingHtml: req.existingHtml,
          pageCss: req.pageCss,
        })}\n\n${jsonShapeHint()}`,
      },
    ],
  })

  const text = extractAnthropicText(response.content)
  if (!text) {
    throw new Error(
      `Anthropic returned no text (stop_reason=${response.stop_reason})`,
    )
  }
  return parseOperationsJson(text)
}

export async function generateGlobalChat(
  req: GlobalChatRequest,
): Promise<GenerateResponse & { provider: string }> {
  if (!req.message?.trim()) {
    throw new Error('message is required')
  }

  const providerId = (
    req.provider ||
    process.env.VISION_PROVIDER ||
    'perceptron'
  ).toLowerCase()

  // Ensure provider id is known (throws if not)
  getVisionProvider(providerId)

  let result: GenerateResponse

  if (providerId === 'anthropic') {
    result = await generateWithAnthropic(req)
  } else if (providerId === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY?.trim()
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set')
    result = await generateWithOpenAICompatible({
      label: 'openai',
      apiKey,
      model: process.env.OPENAI_MODEL?.trim() || 'gpt-4o',
      req,
    })
  } else if (providerId === 'grok') {
    const apiKey =
      process.env.XAI_API_KEY?.trim() || process.env.GROK_API_KEY?.trim()
    if (!apiKey) throw new Error('XAI_API_KEY is not set')
    result = await generateWithOpenAICompatible({
      label: 'grok',
      apiKey,
      model:
        process.env.GROK_MODEL?.trim() ||
        process.env.XAI_MODEL?.trim() ||
        'grok-4.7',
      baseURL: 'https://api.x.ai/v1',
      req,
    })
  } else {
    // perceptron (default)
    const apiKey = process.env.PERCEPTRON_API_KEY?.trim()
    if (!apiKey) throw new Error('PERCEPTRON_API_KEY is not set')
    result = await generateWithOpenAICompatible({
      label: 'perceptron',
      apiKey,
      model: process.env.PERCEPTRON_MODEL?.trim() || 'perceptron-mk1.5',
      baseURL: 'https://api.perceptron.inc/v1',
      req,
    })
  }

  return { ...result, provider: providerId }
}
