import Anthropic from '@anthropic-ai/sdk'
import { buildSystemPrompt, buildUserPrompt, jsonShapeHint } from './prompt.ts'
import { parseOperationsJson } from './schema.ts'
import type { GenerateRequest, GenerateResponse, VisionProvider } from './types.ts'

function stripDataUrl(imageBase64: string): {
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
  data: string
} {
  const match = imageBase64.match(
    /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/,
  )
  if (match) {
    return {
      mediaType: match[1] as
        | 'image/png'
        | 'image/jpeg'
        | 'image/webp'
        | 'image/gif',
      data: match[2],
    }
  }
  return { mediaType: 'image/png', data: imageBase64 }
}

function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim()
}

export function createAnthropicProvider(): VisionProvider {
  return {
    id: 'anthropic',
    async generate(req: GenerateRequest): Promise<GenerateResponse> {
      const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
      const model =
        process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-20250514'

      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY is not set')
      }

      console.log(`[anthropic] Using model ${model} (web_search enabled)`)

      const client = new Anthropic({ apiKey })
      const { mediaType, data } = stripDataUrl(req.imageBase64)

      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        system: [
          buildSystemPrompt(),
          'You may use web_search to find real public image URLs or current facts needed for the label (e.g. a cat photo src).',
          'Prefer direct image URLs (https, commonly .jpg/.png/.webp) from reputable hosts when embedding <img src="...">.',
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
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data,
                },
              },
              {
                type: 'text',
                text: `${buildUserPrompt(req)}\n\n${jsonShapeHint()}`,
              },
            ],
          },
        ],
      })

      const text = extractText(response.content)
      if (!text) {
        throw new Error(
          `Anthropic returned no text (stop_reason=${response.stop_reason})`,
        )
      }
      return parseOperationsJson(text)
    },
  }
}
