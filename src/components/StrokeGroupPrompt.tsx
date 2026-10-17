import { useEffect, useRef, type RefObject } from 'react'
import type { DrawingOverlayHandle } from './DrawingOverlay.tsx'
import { buildGroupFromOpenStrokes, runGeneration } from '../lib/generate.ts'
import { promptPosition } from '../lib/promptPosition.ts'
import { useDrawing } from '../state/drawingStore.tsx'

type Props = {
  containerWidth: number
  containerHeight: number
  overlayRef: RefObject<DrawingOverlayHandle | null>
}

export function StrokeGroupPrompt({
  containerWidth,
  containerHeight,
  overlayRef,
}: Props) {
  const { state, dispatch, openBBox } = useDrawing()
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const visible =
    state.showPrompt &&
    !state.isDrawing &&
    state.openStrokes.length > 0 &&
    !state.isGenerating &&
    !state.previewMode

  useEffect(() => {
    if (visible) {
      inputRef.current?.focus()
    }
  }, [visible])

  if (!visible || !openBBox) return null

  const pos = promptPosition(openBBox, containerWidth, containerHeight)

  const onConfirm = async () => {
    const label = state.labelDraft.trim()
    if (!label || state.openStrokes.length === 0 || state.isGenerating) return

    const group = buildGroupFromOpenStrokes(state.openStrokes, label)
    if (!group) return

    dispatch({ type: 'GENERATE_START' })
    try {
      const operations = await runGeneration({
        overlayRef,
        provider: state.provider,
        group,
        pageCss: state.pageCss,
      })
      dispatch({ type: 'APPLY_OPERATIONS', operations })
    } catch (error) {
      dispatch({
        type: 'GENERATE_ERROR',
        error: error instanceof Error ? error.message : 'Generate failed',
      })
    }
  }

  return (
    <div
      className="stroke-prompt"
      style={{ left: pos.left, top: pos.top }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <label className="stroke-prompt__label" htmlFor="stroke-label">
        Describe what to generate
      </label>
      <textarea
        id="stroke-label"
        ref={inputRef}
        className="stroke-prompt__input"
        rows={2}
        placeholder="e.g. hero headline, delete this section, image of a cat from the web…"
        value={state.labelDraft}
        onChange={(e) =>
          dispatch({ type: 'SET_LABEL', label: e.target.value })
        }
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            void onConfirm()
          }
        }}
      />
      <div className="stroke-prompt__actions">
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => dispatch({ type: 'DISCARD_OPEN' })}
        >
          Discard
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={!state.labelDraft.trim()}
          onClick={() => void onConfirm()}
        >
          Confirm
        </button>
      </div>
    </div>
  )
}
