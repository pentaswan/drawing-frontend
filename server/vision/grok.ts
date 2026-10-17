import OpenAI from 'openai'
import { buildSystemPrompt, buildUserPrompt } from './prompt.ts'
import { OPERATIONS_JSON_SCHEMA, parseOperationsJson } from './schema.ts'
import type { GenerateRequest, GenerateResponse, VisionProvider } from './types.ts'

export function createGrokProvider(): VisionProvider {
  return {
    id: 'grok',
    async generate(req: GenerateRequest): Promise<GenerateResponse> {
      const apiKey =
        process.env.XAI_API_KEY?.trim() || process.env.GROK_API_KEY?.trim()
      const model =
        process.env.GROK_MODEL?.trim() ||
        process.env.XAI_MODEL?.trim() ||
        'grok-4.7'

      if (!apiKey) {
        throw new Error('XAI_API_KEY is not set')
      }

      console.log(`[grok] Using model ${model}`)

      const client = new OpenAI({
        apiKey,
        baseURL: 'https://api.x.ai/v1',
        timeout: 360_000,
      })

      const imageUrl = req.imageBase64.startsWith('data:')
        ? req.imageBase64
        : `data:image/png;base64,${req.imageBase64}`

      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: imageUrl, detail: 'high' },
              },
              { type: 'text', text: buildUserPrompt(req) },
            ],
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
        throw new Error('Grok returned an empty response')
      }
      return parseOperationsJson(content)
    },
  }
}
