import { useEffect, useRef, useState } from 'react'
import { DrawingOverlay, type DrawingOverlayHandle } from './components/DrawingOverlay.tsx'
import { PageDocument } from './components/PageDocument.tsx'
import { StrokeGroupPrompt } from './components/StrokeGroupPrompt.tsx'
import { Toolbar } from './components/Toolbar.tsx'
import { fetchProviders } from './lib/api.ts'
import { DrawingProvider, useDrawing } from './state/drawingStore.tsx'
import './App.css'

function Stage() {
  const overlayRef = useRef<DrawingOverlayHandle>(null)
  const siteRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [providers, setProviders] = useState<string[]>([
    'perceptron',
    'openai',
    'anthropic',
    'grok',
  ])
  const { state, dispatch } = useDrawing()

  useEffect(() => {
    const el = siteRef.current
    if (!el) return
    const update = () => {
      setSize({ width: el.clientWidth, height: el.clientHeight })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchProviders().then((data) => {
      if (cancelled) return
      setProviders(data.providers)
      dispatch({ type: 'SET_PROVIDER', provider: data.defaultProvider })
    })
    return () => {
      cancelled = true
    }
  }, [dispatch])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      const typing =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target?.isContentEditable

      if (event.key === 'Escape' && state.previewMode) {
        event.preventDefault()
        dispatch({ type: 'SET_PREVIEW', enabled: false })
        return
      }

      if (typing || event.metaKey || event.ctrlKey || event.altKey) return

      if (event.key === 't' || event.key === 'T') {
        if (state.isGenerating) return
        event.preventDefault()
        dispatch({ type: 'TOGGLE_PREVIEW' })
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch, state.previewMode, state.isGenerating])

  return (
    <div className={`app-shell${state.previewMode ? ' app-shell--preview' : ''}`}>
      <Toolbar providers={providers} />
      <div className="site" ref={siteRef}>
        <PageDocument />
        <DrawingOverlay ref={overlayRef} />
        <StrokeGroupPrompt
          overlayRef={overlayRef}
          containerWidth={size.width}
          containerHeight={size.height}
        />
      </div>
    </div>
  )
}

export default function App() {
  return (
    <DrawingProvider>
      <Stage />
    </DrawingProvider>
  )
}
