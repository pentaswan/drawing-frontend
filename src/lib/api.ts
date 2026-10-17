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
  pageCss?: string
  sessionId?: string
  provider?: string
}

export type GlobalChatPayload = {
  message: string
  existingElements?: ExistingElementSnapshot[]
  existingHtml?: string
  pageCss?: string
  sessionId?: string
  provider?: string
}

export type BackendRoute = {
  path: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  code: string
  dependencies?: string[]
}

export type SandboxInfo = {
  sessionId: string
  routes: { path: string; method: string; dependencies: string[] }[]
  apiBase: string
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
  | {
      op: 'pageStyle'
      groupId: string
      css: string
    }

export type GenerateResult = {
  operations: RemotePageOperation[]
  backend?: BackendRoute[]
  sandbox?: SandboxInfo
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

export async function sendGlobalChat(
  payload: GlobalChatPayload,
): Promise<GenerateResult> {
  const res = await fetch('/api/global-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = (await res.json()) as GenerateResult & { error?: string }
  if (!res.ok) {
    throw new Error(data.error || `Global chat failed (${res.status})`)
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

export type PublishPayload = {
  slug: string
  title?: string
  pageCss: string
  elements: {
    id: string
    html: string
    align: Align
    script?: string
  }[]
  sessionId: string
}

export type PublishedSiteData = {
  slug: string
  title: string
  pageCss: string
  elements: {
    id: string
    html: string
    align: Align
    script?: string
  }[]
  sandboxSessionId: string
  routes: { path: string; method: string; dependencies: string[] }[]
  publishedAt: number
  urlPath: string
  apiBase: string
}

export async function publishSite(
  payload: PublishPayload,
): Promise<PublishedSiteData> {
  const res = await fetch('/api/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = (await res.json()) as PublishedSiteData & { error?: string }
  if (!res.ok) {
    throw new Error(data.error || `Publish failed (${res.status})`)
  }
  return data
}

export async function fetchPublishedSite(
  slug: string,
): Promise<PublishedSiteData> {
  const res = await fetch(`/api/sites/${encodeURIComponent(slug)}`)
  const data = (await res.json()) as PublishedSiteData & { error?: string }
  if (!res.ok) {
    throw new Error(data.error || `Site not found (${res.status})`)
  }
  return data
}
