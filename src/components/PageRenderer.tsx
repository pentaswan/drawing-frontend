import { useEffect, useRef } from 'react'
import { sanitizeHtml } from '../lib/sanitize.ts'
import type { Align } from '../lib/layout.ts'

export type RenderableElement = {
  id: string
  html: string
  align: Align
  script?: string
  revision?: number
}

function PageBlock({
  element,
  apiBase,
}: {
  element: RenderableElement
  apiBase: string
}) {
  const ref = useRef<HTMLElement>(null)
  const revision = element.revision ?? 1

  useEffect(() => {
    const root = ref.current
    if (!root) return

    let cleanup: (() => void) | undefined

    if (element.script?.trim()) {
      try {
        const runner = new Function(
          'root',
          'element',
          'apiBase',
          `'use strict';\n${element.script}\n`,
        )
        const result: unknown = runner(root, root, apiBase)
        if (typeof result === 'function') {
          cleanup = result as () => void
        }
      } catch (error) {
        console.error(`[page-script ${element.id}]`, error)
      }
    }

    return () => {
      try {
        cleanup?.()
      } catch {
        // ignore cleanup errors
      }
    }
  }, [element.id, revision, element.script, element.html, apiBase])

  return (
    <section
      ref={ref}
      className={`page-block page-block--${element.align}`}
      data-align={element.align}
      data-element-id={element.id}
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(element.html) }}
    />
  )
}

export function normalizePageCss(css: string): string {
  const cleaned = css.replace(/<\/style/gi, '').trim()
  if (!cleaned) return ''
  if (!cleaned.includes('{')) {
    return `.site {\n${cleaned}\n}`
  }
  return cleaned
}

type Props = {
  elements: RenderableElement[]
  pageCss: string
  apiBase: string
  emptyHint?: string | null
}

export function PageRenderer({
  elements,
  pageCss,
  apiBase,
  emptyHint = null,
}: Props) {
  const css = normalizePageCss(pageCss)

  return (
    <div className="page-document" data-page-root>
      {css ? <style data-page-css>{css}</style> : null}
      {elements.length === 0 && emptyHint ? (
        <p className="page-document__hint">{emptyHint}</p>
      ) : null}
      {elements.map((el) => (
        <PageBlock key={el.id} element={el} apiBase={apiBase} />
      ))}
    </div>
  )
}
