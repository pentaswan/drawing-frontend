import { useEffect, useRef } from 'react'
import { sanitizeHtml } from '../lib/sanitize.ts'
import {
  useDrawing,
  type GeneratedElement,
} from '../state/drawingStore.tsx'

function PageBlock({ element }: { element: GeneratedElement }) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const root = ref.current
    if (!root) return

    let cleanup: (() => void) | undefined

    if (element.script?.trim()) {
      try {
        const runner = new Function(
          'root',
          'element',
          `'use strict';\n${element.script}\n`,
        )
        const result: unknown = runner(root, root)
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
  }, [element.id, element.revision, element.script, element.html])

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

export function PageDocument() {
  const { state } = useDrawing()

  return (
    <div className="page-document" data-page-root>
      {state.generatedElements.length === 0 ? (
        <p className="page-document__hint">
          Draw anywhere, label groups, then Generate — add, change, or remove
          sections in page flow. Scripts on elements can animate canvases and
          more.
        </p>
      ) : null}
      {state.generatedElements.map((el) => (
        <PageBlock key={el.id} element={el} />
      ))}
    </div>
  )
}
