import { useEffect, useId, useRef, useState } from 'react'
import { publishSite } from '../lib/api.ts'
import { slugError } from '../lib/slug.ts'
import { useDrawing } from '../state/drawingStore.tsx'

export function PublishButton() {
  const { state, dispatch } = useDrawing()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()

  const disabled =
    state.isGenerating ||
    state.isGlobalChatting ||
    state.previewMode ||
    busy

  useEffect(() => {
    if (open) {
      setLocalError(null)
      setPublishedUrl(null)
      inputRef.current?.focus()
    }
  }, [open])

  const onPublish = async () => {
    const err = slugError(name)
    if (err) {
      setLocalError(err)
      return
    }
    if (state.generatedElements.length === 0 && !state.pageCss.trim()) {
      setLocalError('Add some page content before publishing')
      return
    }

    setBusy(true)
    setLocalError(null)
    try {
      const result = await publishSite({
        slug: name.trim(),
        title: name.trim(),
        pageCss: state.pageCss,
        elements: state.generatedElements.map((el) => ({
          id: el.id,
          html: el.html,
          align: el.align,
          script: el.script,
        })),
        sessionId: state.sessionId,
      })
      const url = `${window.location.origin}${result.urlPath}`
      setPublishedUrl(url)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Publish failed'
      setLocalError(message)
      dispatch({ type: 'GENERATE_ERROR', error: message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="publish">
      <button
        type="button"
        className="btn btn--primary"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        Publish
      </button>

      {open ? (
        <div
          className="publish-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="publish-modal__backdrop" onClick={() => !busy && setOpen(false)} />
          <div className="publish-modal__panel">
            <h2 id={titleId} className="publish-modal__title">
              Publish site
            </h2>
            <p className="publish-modal__help">
              Choose a URL name (letters, numbers, <code>-</code>,{' '}
              <code>_</code>). It will be available at{' '}
              <code>
                {typeof window !== 'undefined' ? window.location.origin : ''}
                /
                {name.trim() || 'your-name'}
              </code>
              .
            </p>
            <label className="publish-modal__label" htmlFor="publish-slug">
              Site name
            </label>
            <input
              id="publish-slug"
              ref={inputRef}
              className="publish-modal__input"
              value={name}
              disabled={busy || Boolean(publishedUrl)}
              placeholder="my-cool-site"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => {
                setName(e.target.value)
                setLocalError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void onPublish()
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  if (!busy) setOpen(false)
                }
              }}
            />
            {localError ? (
              <p className="publish-modal__error" role="alert">
                {localError}
              </p>
            ) : null}
            {publishedUrl ? (
              <p className="publish-modal__success">
                Live at{' '}
                <a href={publishedUrl} target="_blank" rel="noreferrer">
                  {publishedUrl}
                </a>
              </p>
            ) : null}
            <div className="publish-modal__actions">
              <button
                type="button"
                className="btn btn--ghost"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                {publishedUrl ? 'Close' : 'Cancel'}
              </button>
              {!publishedUrl ? (
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={busy || !name.trim()}
                  onClick={() => void onPublish()}
                >
                  {busy ? 'Publishing…' : 'Publish'}
                </button>
              ) : (
                <a
                  className="btn btn--primary"
                  href={publishedUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open
                </a>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
