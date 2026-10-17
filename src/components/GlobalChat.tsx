import { useRef, useState } from 'react'
import { runGlobalChat } from '../lib/generate.ts'
import { useDrawing } from '../state/drawingStore.tsx'

export function GlobalChat() {
  const { state, dispatch } = useDrawing()
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  if (state.previewMode) return null

  const busy = state.isGenerating || state.isGlobalChatting

  const onSubmit = async () => {
    const message = draft.trim()
    if (!message || busy) return

    dispatch({ type: 'GLOBAL_CHAT_START' })
    try {
      const operations = await runGlobalChat({
        message,
        provider: state.provider,
        pageCss: state.pageCss,
      })
      dispatch({ type: 'APPLY_OPERATIONS', operations })
      setDraft('')
      inputRef.current?.focus()
    } catch (error) {
      dispatch({
        type: 'GENERATE_ERROR',
        error: error instanceof Error ? error.message : 'Global chat failed',
      })
    }
  }

  return (
    <form
      className="global-chat"
      onSubmit={(e) => {
        e.preventDefault()
        void onSubmit()
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <label className="global-chat__label" htmlFor="global-chat-input">
        Global Edits
      </label>
      <div className="global-chat__row">
        <textarea
          id="global-chat-input"
          ref={inputRef}
          className="global-chat__input"
          placeholder="e.g. soft blue background, or fetch YouTube views…"
          value={draft}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void onSubmit()
            }
          }}
        />
        <button
          type="submit"
          className="btn btn--primary global-chat__enter"
          disabled={busy || !draft.trim()}
        >
          {state.isGlobalChatting ? '…' : 'Enter'}
        </button>
      </div>
    </form>
  )
}
