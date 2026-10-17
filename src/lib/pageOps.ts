import type { Align } from './layout.ts'
import type { BBox } from './geometry.ts'

export type LayoutItem = {
  id: string
  yMid: number
}

export type PageOpAdd = {
  op: 'add'
  html: string
  align: Align
  script?: string
  insertIndex: number
}

export type PageOpReplace = {
  op: 'replace'
  targetId: string
  html: string
  align?: Align
  script?: string | null
}

export type PageOpRemove = {
  op: 'remove'
  targetId: string
}

export type AppliedPageOp = PageOpAdd | PageOpReplace | PageOpRemove

export function findInsertIndex(drawY: number, layout: LayoutItem[]): number {
  for (let i = 0; i < layout.length; i++) {
    if (drawY < layout[i].yMid) return i
  }
  return layout.length
}

export function findNearestId(
  drawY: number,
  layout: LayoutItem[],
): string | null {
  if (layout.length === 0) return null
  let best = layout[0]
  let bestDist = Math.abs(layout[0].yMid - drawY)
  for (const item of layout) {
    const dist = Math.abs(item.yMid - drawY)
    if (dist < bestDist) {
      best = item
      bestDist = dist
    }
  }
  return best.id
}

export function drawMidY(bbox: BBox): number {
  return bbox.y + bbox.height / 2
}

const REMOVE_RE = /\b(remove|delete|erase|get rid of)\b/i
const REPLACE_RE =
  /\b(change|modify|update|replace|edit|make|turn|restyle|recolor)\b/i

export function inferOpKind(
  label: string,
  hasTargets: boolean,
): 'add' | 'replace' | 'remove' {
  if (hasTargets && REMOVE_RE.test(label)) return 'remove'
  if (hasTargets && REPLACE_RE.test(label)) return 'replace'
  return 'add'
}

/** Pull <script> bodies out of HTML so they can run after mount. */
export function extractScripts(html: string): {
  html: string
  script?: string
} {
  const chunks: string[] = []
  const cleaned = html.replace(
    /<script\b[^>]*>([\s\S]*?)<\/script>/gi,
    (_full, code: string) => {
      if (code.trim()) chunks.push(code.trim())
      return ''
    },
  )
  return {
    html: cleaned,
    script: chunks.length > 0 ? chunks.join('\n\n') : undefined,
  }
}
