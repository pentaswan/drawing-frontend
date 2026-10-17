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

const BACKEND_GUIDANCE = [
  'You may add sandboxed Node.js backend routes in the top-level "backend" array when the user needs server-side work (scraping, APIs, secrets-free fetches).',
  'Each backend item: { path, method, code, dependencies }. path like "/youtube-views". Client scripts receive `apiBase` and should fetch(`${apiBase}/youtube-views?...`).',
  'Handler code: define async function handler(req, res). req has method, path, query, headers, body. Use res.json(data), res.text(str), res.status(code).json(data). Use global fetch for outbound HTTP.',
  'dependencies: only allowlisted packages (cheerio, axios, zod, uuid, date-fns, lodash, node-html-parser, rss-parser, marked, sanitize-html, he, qs, nanoid). Prefer built-in fetch with zero deps when possible.',
  'Never use fs, child_process, process.env, eval, or localhost URLs in backend code.',
  'If no backend is needed, return "backend": [].',
].join(' ')

export function buildSystemPrompt(): string {
  return [
    'You edit a scrollable HTML page from red-pen sketches and text labels.',
    'Return JSON with operations and backend arrays only (add, replace, remove, pageStyle) — never a full page rewrite unless asked.',
    'Page layout is normal document flow (position: static), stacked vertically, with left/center/right alignment.',
    'Choose op from the label intent:',
    '- add: create a new section (default). Place with anchorId/position from draw Y vs existing elements.',
    '- replace/modify: change an existing element the drawing targets; set targetId.',
    '- remove/delete: remove the targeted existing element; set targetId.',
    '- pageStyle: global CSS for the page (background, fonts, etc.); put CSS in the css field. Prefer rules like `.site { background: ... }` or `.site .page-block { ... }`.',
    'For interactive or animated behavior, put JavaScript in the "script" field (not inline on* handlers).',
    'Scripts receive `root` (the section element) and `apiBase` (this user\'s sandboxed API prefix). Query children from root. Return a cleanup function when using timers/raf.',
    'Example script for a canvas color animation: find canvas in root, use requestAnimationFrame to lerp fillStyle between colors, return () => cancelAnimationFrame(id).',
    'HTML may include <canvas>, headings, buttons, forms, etc. Do not use position:absolute/fixed for page placement.',
    'Never include <script> tags inside html — use the script field.',
    'Never use javascript: URLs.',
    'When a label needs a real image or online resource, search the web (if available) and use a concrete https URL in html (e.g. <img src="https://..."> with alt text).',
    'One operation per labeled group when possible. Preserve groupId on each operation.',
    BACKEND_GUIDANCE,
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

  const cssBlock = req.pageCss?.trim()
    ? `Current page CSS:\n${req.pageCss.slice(0, 2000)}`
    : 'Current page CSS: (none)'

  return [
    `Page width: ${req.pageWidth}px. Use drawMidY against existing yMid values to insert between elements (before the first mid greater than drawMidY) or append at end.`,
    'The image shows red drawings over the current page.',
    'Labeled stroke groups:',
    groups,
    'Existing page elements (top to bottom):',
    existing,
    cssBlock,
    'Return operations that fulfill each label (add/replace/remove/pageStyle). For add, set anchorId+position when inserting between items; use position=end to append. Include backend routes when server-side logic is needed.',
  ].join('\n\n')
}

export function buildGlobalSystemPrompt(): string {
  return [
    'You are a global page editor for Inkframe. The user types natural-language requests that affect the whole website (not a single sketched region).',
    'Return JSON with operations and backend arrays only.',
    'Supported ops: add, replace, remove, pageStyle.',
    'Use pageStyle for backgrounds, global fonts, colors, spacing — put CSS in the css field (injected as a stylesheet; target `.site` or `.site .page-block`).',
    'Use add/replace/remove for structural page changes when asked.',
    'For client interactivity use the script field with `root` and `apiBase`.',
    'Never include <script> tags in html. Never use javascript: URLs.',
    BACKEND_GUIDANCE,
    'Prefer minimal operations that match the request. groupId can be "global" or a short id.',
  ].join(' ')
}

export function buildGlobalUserPrompt(args: {
  message: string
  existingElements?: GenerateRequest['existingElements']
  existingHtml?: string
  pageCss?: string
}): string {
  const existing =
    args.existingElements && args.existingElements.length > 0
      ? args.existingElements
          .map(
            (el) =>
              `${el.index}. id=${el.id} align=${el.align} yMid=${Math.round(el.yMid)}\nHTML:\n${el.html.slice(0, 1200)}`,
          )
          .join('\n\n')
      : 'None — page body is empty.'

  return [
    `User request: ${JSON.stringify(args.message)}`,
    'Existing page elements:',
    existing,
    args.pageCss?.trim()
      ? `Current page CSS:\n${args.pageCss.slice(0, 2000)}`
      : 'Current page CSS: (none)',
    'Return JSON operations (and backend if needed) to fulfill the request.',
  ].join('\n\n')
}

export function jsonShapeHint(): string {
  return `JSON shape: {"operations":[{"op":"add|replace|remove|pageStyle","groupId":"...","targetId":null,"html":"... or null","align":"left|center|right|null","script":"optional JS with root+apiBase or null","anchorId":null,"position":"before|after|end|null","css":"for pageStyle or null"}],"backend":[{"path":"/my-route","method":"GET","code":"async function handler(req,res){...}","dependencies":[]}]}`
}
