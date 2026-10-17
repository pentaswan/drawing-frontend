import { apiBaseForSession } from '../lib/session.ts'
import { useDrawing } from '../state/drawingStore.tsx'
import { PageRenderer } from './PageRenderer.tsx'

export function PageDocument() {
  const { state } = useDrawing()
  const apiBase = apiBaseForSession(state.sessionId)

  return (
    <PageRenderer
      elements={state.generatedElements}
      pageCss={state.pageCss}
      apiBase={apiBase}
      emptyHint="Draw anywhere, label groups, then Confirm — or use Global edits for page-wide styles and backend APIs."
    />
  )
}
