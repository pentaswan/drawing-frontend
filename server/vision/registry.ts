import { createAnthropicProvider } from './anthropic.ts'
import { createGrokProvider } from './grok.ts'
import { createOpenAIProvider } from './openai.ts'
import { createPerceptronProvider } from './perceptron.ts'
import type { VisionProvider } from './types.ts'

const providers: Record<string, () => VisionProvider> = {
  perceptron: createPerceptronProvider,
  openai: createOpenAIProvider,
  anthropic: createAnthropicProvider,
  grok: createGrokProvider,
}

export function listProviderIds(): string[] {
  return Object.keys(providers)
}

export function getVisionProvider(id?: string): VisionProvider {
  const key = (id || process.env.VISION_PROVIDER || 'perceptron').toLowerCase()
  const factory = providers[key]
  if (!factory) {
    throw new Error(
      `Unknown vision provider "${key}". Supported: ${listProviderIds().join(', ')}`,
    )
  }
  return factory()
}
