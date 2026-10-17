import type { BBox } from './geometry.ts'
import type { Align } from './layout.ts'
import type { ExistingElementSnapshot } from './pageHtml.ts'

export type GeneratePayload = {
  imageBase64: string
  pageWidth: number
  pageHeight: number
  groups: { id: string; label: string; bbox: BBox }[]
  existingElements?: ExistingElementSnapshot[]
  existingHtml?: string
  provider?: string
}

export type RemotePageOperation =
  | {
      op: 'add'
      groupId: string
      html: string
      align: Align
      script?: string
      anchorId?: string | null
      position?: 'before' | 'after' | 'end'
    }
  | {
      op: 'replace'
      groupId: string
      targetId: string
      html: string
      align?: Align
      script?: string | null
    }
  | {
      op: 'remove'
      groupId: string
      targetId: string
    }

export type GenerateResult = {
  operations: RemotePageOperation[]
  provider?: string
}

export async function generateElements(
  payload: GeneratePayload,
): Promise<GenerateResult> {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = (await res.json()) as GenerateResult & { error?: string }
  if (!res.ok) {
    throw new Error(data.error || `Generate failed (${res.status})`)
  }
  return data
}

export async function fetchProviders(): Promise<{
  defaultProvider: string
  providers: string[]
}> {
  const res = await fetch('/api/providers')
  if (!res.ok) {
    return {
      defaultProvider: 'perceptron',
      providers: ['perceptron', 'openai', 'anthropic', 'grok'],
    }
  }
  return res.json() as Promise<{ defaultProvider: string; providers: string[] }>
}
