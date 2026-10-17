import type { Align, PageOperation } from './types.ts'

/** Flat operation shape so strict JSON-schema providers accept every field. */
export const OPERATIONS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['operations'],
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
        ],
        properties: {
          op: {
            type: 'string',
            enum: ['add', 'replace', 'remove'],
          },
          groupId: { type: 'string' },
          targetId: {
            type: ['string', 'null'],
            description: 'Existing element id for replace/remove; null for add.',
          },
          html: {
            type: ['string', 'null'],
            description: 'HTML for add/replace; null for remove.',
          },
          align: {
            type: ['string', 'null'],
            enum: ['left', 'center', 'right', null],
          },
          script: {
            type: ['string', 'null'],
            description:
              'JS with `root` bound to the section. Return a cleanup fn for raf/timers. Null if none.',
          },
          anchorId: {
            type: ['string', 'null'],
            description: 'For add: nearby element id; otherwise null.',
          },
          position: {
            type: ['string', 'null'],
            enum: ['before', 'after', 'end', null],
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

export function parseOperationsJson(content: string): {
  operations: PageOperation[]
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
  }

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

  return { operations }
}

export const ELEMENTS_JSON_SCHEMA = OPERATIONS_JSON_SCHEMA
export const parseElementsJson = parseOperationsJson
