import OpenAI from 'openai'
import { buildSystemPrompt, buildUserPrompt } from './prompt.ts'
import { OPERATIONS_JSON_SCHEMA, parseOperationsJson } from './schema.ts'
import type { GenerateRequest, GenerateResponse, VisionProvider } from './types.ts'

export function createPerceptronProvider(): VisionProvider {
  return {
    id: 'perceptron',
    async generate(req: GenerateRequest): Promise<GenerateResponse> {
      const apiKey = process.env.PERCEPTRON_API_KEY?.trim()
      const model = process.env.PERCEPTRON_MODEL?.trim() || 'perceptron-mk1.5'

      if (!apiKey) {
        throw new Error('PERCEPTRON_API_KEY is not set')
      }

      console.log(`[perceptron] Using model ${model}`)

      const client = new OpenAI({
        apiKey,
        baseURL: 'https://api.perceptron.inc/v1',
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
        throw new Error('Perceptron returned an empty response')
      }
      return parseOperationsJson(content)
    },
  }
}
