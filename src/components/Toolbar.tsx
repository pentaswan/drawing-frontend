import { useDrawing } from '../state/drawingStore.tsx'

type Props = {
  providers: string[]
}

export function Toolbar({ providers }: Props) {
  const { state, dispatch, canUndo } = useDrawing()

  return (
    <header className="toolbar">
      <div className="toolbar__brand">
        <span className="toolbar__mark" aria-hidden />
        <div>
          <h1 className="toolbar__title">Inkframe</h1>
          <p className="toolbar__subtitle">
            {state.previewMode
              ? 'Preview — interact with the page (Esc or T to exit)'
              : 'Sketch a site → confirm to generate'}
          </p>
        </div>
      </div>

      <div className="toolbar__controls">
        <label className="toolbar__field">
          <span>Vision</span>
          <select
            value={state.provider}
            onChange={(e) =>
              dispatch({ type: 'SET_PROVIDER', provider: e.target.value })
            }
            disabled={state.isGenerating || state.previewMode}
          >
            {providers.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className={
            state.previewMode ? 'btn btn--primary' : 'btn btn--ghost'
          }
          onClick={() => dispatch({ type: 'TOGGLE_PREVIEW' })}
          disabled={state.isGenerating}
          aria-pressed={state.previewMode}
          title="Toggle preview (T)"
        >
          {state.previewMode ? 'Exit preview' : 'Preview'}
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => dispatch({ type: 'UNDO' })}
          disabled={!canUndo}
        >
          Undo
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => dispatch({ type: 'CLEAR_INK' })}
          disabled={state.isGenerating || state.previewMode}
        >
          Clear ink
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => dispatch({ type: 'CLEAR_PAGE' })}
          disabled={state.isGenerating || state.previewMode}
        >
          Reset page
        </button>
      </div>

      {state.error ? (
        <div className="toolbar__error" role="alert">
          <span>{state.error}</span>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => dispatch({ type: 'CLEAR_ERROR' })}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="toolbar__status">
        <span>{state.generatedElements.length} on page</span>
        <span>{state.history.length} undo steps</span>
        <span>
          {state.previewMode
            ? 'preview'
            : state.isGenerating
              ? 'generating…'
              : state.openStrokes.length > 0
                ? `${state.openStrokes.length} stroke(s) open`
                : 'ready'}
        </span>
      </div>
    </header>
  )
}
