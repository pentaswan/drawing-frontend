import type { GenerateRequest } from './types.ts'

function inferAlignHint(
  bbox: { x: number; y: number; width: number; height: number },
  pageWidth: number,
): 'left' | 'center' | 'right' {
  if (pageWidth <= 0) return 'center'
  const mid = bbox.x + bbox.width / 2
  const rel = mid / pageWidth
  if (bbox.width / pageWidth >= 0.72) return 'center'
  if (rel < 0.38) return 'left'
  if (rel > 0.62) return 'right'
  return 'center'
}

export function buildSystemPrompt(): string {
  return [
    'You edit a scrollable HTML page from red-pen sketches and text labels.',
    'Return JSON operations only (add, replace, remove) — never a full page rewrite unless asked.',
    'Page layout is normal document flow (position: static), stacked vertically, with left/center/right alignment.',
    'Choose op from the label intent:',
    '- add: create a new section (default). Place with anchorId/position from draw Y vs existing elements.',
    '- replace/modify: change an existing element the drawing targets; set targetId.',
    '- remove/delete: remove the targeted existing element; set targetId.',
    'For interactive or animated behavior, put JavaScript in the "script" field (not inline on* handlers).',
    'Scripts receive `root` (the section element). Query children from root. Return a cleanup function when using timers/raf.',
    'Example script for a canvas color animation: find canvas in root, use requestAnimationFrame to lerp fillStyle between colors, return () => cancelAnimationFrame(id).',
    'HTML may include <canvas>, headings, buttons, forms, etc. Do not use position:absolute/fixed for page placement.',
    'Never include <script> tags inside html — use the script field.',
    'Never use javascript: URLs.',
    'When a label needs a real image or online resource, search the web (if available) and use a concrete https URL in html (e.g. <img src="https://..."> with alt text).',
    'One operation per labeled group when possible. Preserve groupId on each operation.',
  ].join(' ')
}

export function buildUserPrompt(req: GenerateRequest): string {
  const ordered = [...req.groups].sort(
    (a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x,
  )

  const groups = ordered
    .map((g, i) => {
      const align = inferAlignHint(g.bbox, req.pageWidth)
      const drawMidY = Math.round(g.bbox.y + g.bbox.height / 2)
      return `${i + 1}. groupId=${g.id} label=${JSON.stringify(g.label)} suggestedAlign=${align} drawMidY=${drawMidY} drawBox={x:${Math.round(g.bbox.x)},y:${Math.round(g.bbox.y)},w:${Math.round(g.bbox.width)},h:${Math.round(g.bbox.height)}}`
    })
    .join('\n')

  const existing =
    req.existingElements && req.existingElements.length > 0
      ? req.existingElements
          .map(
            (el) =>
              `${el.index}. id=${el.id} align=${el.align} yTop=${Math.round(el.yTop)} yMid=${Math.round(el.yMid)} yBottom=${Math.round(el.yBottom)}\nHTML:\n${el.html.slice(0, 1200)}`,
          )
          .join('\n\n')
      : 'None — page body is empty.'

  return [
    `Page width: ${req.pageWidth}px. Use drawMidY against existing yMid values to insert between elements (before the first mid greater than drawMidY) or append at end.`,
    'The image shows red drawings over the current page.',
    'Labeled stroke groups:',
    groups,
    'Existing page elements (top to bottom):',
    existing,
    'Return operations that fulfill each label (add/replace/remove). For add, set anchorId+position when inserting between items; use position=end to append.',
  ].join('\n\n')
}
