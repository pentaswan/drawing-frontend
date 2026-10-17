import type { Align, BackendRoute, PageOperation } from './types.ts'

/** Flat operation shape so strict JSON-schema providers accept every field. */
export const OPERATIONS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['operations', 'backend'],
  properties: {
    operations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'op',
          'groupId',
          'targetId',
          'html',
          'align',
          'script',
          'anchorId',
          'position',
          'css',
        ],
        properties: {
          op: {
            type: 'string',
            enum: ['add', 'replace', 'remove', 'pageStyle'],
          },
          groupId: { type: 'string' },
          targetId: {
            type: ['string', 'null'],
            description: 'Existing element id for replace/remove; null otherwise.',
          },
          html: {
            type: ['string', 'null'],
            description: 'HTML for add/replace; null for remove/pageStyle.',
          },
          align: {
            type: ['string', 'null'],
            enum: ['left', 'center', 'right', null],
          },
          script: {
            type: ['string', 'null'],
            description:
              'Client JS with `root` and `apiBase` (sandbox API prefix). Return cleanup for raf/timers. Null if none.',
          },
          anchorId: {
            type: ['string', 'null'],
            description: 'For add: nearby element id; otherwise null.',
          },
          position: {
            type: ['string', 'null'],
            enum: ['before', 'after', 'end', null],
          },
          css: {
            type: ['string', 'null'],
            description:
              'For pageStyle: CSS rules scoped to the page (.site). Null otherwise.',
          },
        },
      },
    },
    backend: {
      type: 'array',
      description:
        'Optional sandboxed Node.js API routes for this user session. Empty array if none.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'method', 'code', 'dependencies'],
        properties: {
          path: {
            type: 'string',
            description: 'Route path starting with / e.g. /youtube-views',
          },
          method: {
            type: 'string',
            enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
          },
          code: {
            type: 'string',
            description:
              'Handler body or full module exporting async function handler(req, res). Use res.json(). Call fetch for outbound HTTP. Allowed deps only.',
          },
          dependencies: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Allowlisted npm packages e.g. cheerio, axios, zod. Empty if none.',
          },
        },
      },
    },
  },
} as const

function normalizeAlign(value: unknown): Align {
  if (value === 'left' || value === 'right' || value === 'center') return value
  return 'center'
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  return value
}

function asNullableString(value: unknown): string | null | undefined {
  if (value === null) return null
  if (typeof value === 'string') return value
  return undefined
}

function parseBackend(raw: unknown): BackendRoute[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined
  const routes: BackendRoute[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const path = asString(row.path)?.trim()
    const code = asString(row.code)
    if (!path || !code) continue
    const methodRaw = (asString(row.method) || 'GET').toUpperCase()
    const method = (
      ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(methodRaw)
        ? methodRaw
        : 'GET'
    ) as BackendRoute['method']
    const dependencies = Array.isArray(row.dependencies)
      ? row.dependencies.filter((d): d is string => typeof d === 'string')
      : []
    routes.push({ path, method, code, dependencies })
  }
  return routes.length > 0 ? routes : undefined
}

export function parseOperationsJson(content: string): {
  operations: PageOperation[]
  backend?: BackendRoute[]
} {
  const trimmed = content.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1].trim() : trimmed
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1) {
    throw new Error('Vision model did not return JSON')
  }
  const parsed = JSON.parse(raw.slice(start, end + 1)) as {
    operations?: unknown
    elements?: unknown
    backend?: unknown
  }

  const backend = parseBackend(parsed.backend)

  if (!Array.isArray(parsed.operations) && Array.isArray(parsed.elements)) {
    return {
      operations: parsed.elements.map((item, index) => {
        const el = (item ?? {}) as {
          id?: unknown
          html?: unknown
          align?: unknown
          script?: unknown
        }
        if (typeof el.html !== 'string') {
          throw new Error(`Element ${index} missing html string`)
        }
        return {
          op: 'add' as const,
          groupId:
            typeof el.id === 'string' && el.id.trim()
              ? el.id
              : `element_${index}`,
          html: el.html,
          align: normalizeAlign(el.align),
          script: asString(el.script),
          position: 'end' as const,
        }
      }),
      backend,
    }
  }

  if (!Array.isArray(parsed.operations)) {
    throw new Error('Vision response missing operations array')
  }

  const operations: PageOperation[] = parsed.operations.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`Invalid operation at index ${index}`)
    }
    const row = item as Record<string, unknown>
    const kind = row.op
    const groupId = asString(row.groupId)?.trim() || `group_${index}`

    if (kind === 'pageStyle') {
      const css = asString(row.css) ?? asString(row.html) ?? ''
      if (!css.trim()) {
        throw new Error(`Operation ${index} pageStyle missing css`)
      }
      return { op: 'pageStyle', groupId, css }
    }

    if (kind === 'remove') {
      const targetId = asString(row.targetId)?.trim()
      if (!targetId) {
        throw new Error(`Operation ${index} remove missing targetId`)
      }
      return { op: 'remove', groupId, targetId }
    }

    if (kind === 'replace') {
      const targetId = asString(row.targetId)?.trim()
      const html = asString(row.html)
      if (!targetId || html === undefined) {
        throw new Error(`Operation ${index} replace missing targetId/html`)
      }
      const scriptRaw = asNullableString(row.script)
      return {
        op: 'replace',
        groupId,
        targetId,
        html,
        align:
          row.align === null || row.align === undefined
            ? undefined
            : normalizeAlign(row.align),
        script: scriptRaw === undefined ? undefined : scriptRaw,
      }
    }

    if (kind === 'add') {
      const html = asString(row.html)
      if (html === undefined) {
        throw new Error(`Operation ${index} add missing html`)
      }
      const position =
        row.position === 'before' ||
        row.position === 'after' ||
        row.position === 'end'
          ? row.position
          : undefined
      const anchorRaw = asNullableString(row.anchorId)
      return {
        op: 'add',
        groupId,
        html,
        align: normalizeAlign(row.align),
        script: asString(row.script),
        anchorId: anchorRaw === undefined ? null : anchorRaw,
        position,
      }
    }

    throw new Error(`Operation ${index} has unknown op "${String(kind)}"`)
  })

  return { operations, backend }
}

export const ELEMENTS_JSON_SCHEMA = OPERATIONS_JSON_SCHEMA
export const parseElementsJson = parseOperationsJson
