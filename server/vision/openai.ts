import OpenAI from 'openai'
import { buildSystemPrompt, buildUserPrompt } from './prompt.ts'
import { OPERATIONS_JSON_SCHEMA, parseOperationsJson } from './schema.ts'
import type { GenerateRequest, GenerateResponse, VisionProvider } from './types.ts'

export function createOpenAIProvider(): VisionProvider {
  return {
    id: 'openai',
    async generate(req: GenerateRequest): Promise<GenerateResponse> {
      const apiKey = process.env.OPENAI_API_KEY?.trim()
      const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o'

      if (!apiKey) {
        throw new Error('OPENAI_API_KEY is not set')
      }

      console.log(`[openai] Using model ${model}`)

      const client = new OpenAI({ apiKey })

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
              { type: 'image_url', image_url: { url: imageUrl } },
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
        throw new Error('OpenAI returned an empty response')
      }
      return parseOperationsJson(content)
    },
  }
}
