import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { BBox, Stroke } from '../lib/geometry.ts'
import { useDrawing } from '../state/drawingStore.tsx'

const PEN_COLOR = '#e11d48'
const PEN_WIDTH = 2.5

export type DrawingOverlayHandle = {
  exportAnnotatedPng: () => string | null
  getSize: () => { width: number; height: number }
}

function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  color: string,
  width: number,
) {
  if (stroke.points.length === 0) return
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
  for (let i = 1; i < stroke.points.length; i++) {
    ctx.lineTo(stroke.points[i].x, stroke.points[i].y)
  }
  if (stroke.points.length === 1) {
    ctx.lineTo(stroke.points[0].x + 0.01, stroke.points[0].y)
  }
  ctx.stroke()
}

function drawLabeledBox(
  ctx: CanvasRenderingContext2D,
  bbox: BBox,
  label: string,
) {
  ctx.save()
  ctx.strokeStyle = 'rgba(225, 29, 72, 0.85)'
  ctx.setLineDash([6, 4])
  ctx.lineWidth = 1.5
  ctx.strokeRect(bbox.x, bbox.y, bbox.width, bbox.height)
  ctx.setLineDash([])
  ctx.fillStyle = 'rgba(225, 29, 72, 0.9)'
  ctx.font = '12px "IBM Plex Sans", system-ui, sans-serif'
  const text = label.slice(0, 40)
  const metrics = ctx.measureText(text)
  const padX = 6
  const padY = 4
  const boxH = 18
  const boxW = metrics.width + padX * 2
  const boxY = Math.max(0, bbox.y - boxH - 2)
  ctx.fillRect(bbox.x, boxY, boxW, boxH)
  ctx.fillStyle = '#fff'
  ctx.fillText(text, bbox.x + padX, boxY + boxH - padY)
  ctx.restore()
}

export const DrawingOverlay = forwardRef<DrawingOverlayHandle>(
  function DrawingOverlay(_, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const { state, dispatch } = useDrawing()
    const stateRef = useRef(state)
    stateRef.current = state

    const paint = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const current = stateRef.current
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)

      for (const group of current.sealedGroups) {
        for (const stroke of group.strokes) {
          drawStroke(ctx, stroke, 'rgba(225, 29, 72, 0.55)', PEN_WIDTH)
        }
        ctx.save()
        ctx.strokeStyle = 'rgba(225, 29, 72, 0.35)'
        ctx.setLineDash([4, 3])
        ctx.lineWidth = 1
        ctx.strokeRect(
          group.bbox.x,
          group.bbox.y,
          group.bbox.width,
          group.bbox.height,
        )
        ctx.restore()
      }
      for (const stroke of current.openStrokes) {
        drawStroke(ctx, stroke, PEN_COLOR, PEN_WIDTH)
      }
      if (current.currentPoints && current.currentPoints.length > 0) {
        drawStroke(ctx, { points: current.currentPoints }, PEN_COLOR, PEN_WIDTH)
      }
    }

    useImperativeHandle(ref, () => ({
      getSize() {
        const canvas = canvasRef.current
        if (!canvas) return { width: 0, height: 0 }
        return { width: canvas.clientWidth, height: canvas.clientHeight }
      },
      exportAnnotatedPng() {
        const canvas = canvasRef.current
        if (!canvas) return null

        const exportCanvas = document.createElement('canvas')
        exportCanvas.width = canvas.width
        exportCanvas.height = canvas.height
        const ctx = exportCanvas.getContext('2d')
        if (!ctx) return null

        const dpr = window.devicePixelRatio || 1
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)

        const current = stateRef.current
        for (const group of current.sealedGroups) {
          for (const stroke of group.strokes) {
            drawStroke(ctx, stroke, PEN_COLOR, PEN_WIDTH)
          }
          drawLabeledBox(ctx, group.bbox, group.label)
        }
        for (const stroke of current.openStrokes) {
          drawStroke(ctx, stroke, PEN_COLOR, PEN_WIDTH)
        }

        return exportCanvas.toDataURL('image/png')
      },
    }))

    useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const parent = canvas.parentElement
      if (!parent) return

      const resize = () => {
        const rect = parent.getBoundingClientRect()
        const dpr = window.devicePixelRatio || 1
        canvas.width = Math.max(1, Math.floor(rect.width * dpr))
        canvas.height = Math.max(1, Math.floor(rect.height * dpr))
        canvas.style.width = `${rect.width}px`
        canvas.style.height = `${rect.height}px`
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        }
        paint()
      }

      resize()
      const observer = new ResizeObserver(resize)
      observer.observe(parent)
      return () => observer.disconnect()
    }, [])

    useEffect(() => {
      paint()
    }, [
      state.sealedGroups,
      state.openStrokes,
      state.currentPoints,
    ])

    const toLocalPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return { x: 0, y: 0 }
      const rect = canvas.getBoundingClientRect()
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      }
    }

    const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (state.isGenerating || state.previewMode) return
      event.currentTarget.setPointerCapture(event.pointerId)
      dispatch({ type: 'POINTER_DOWN', point: toLocalPoint(event) })
    }

    const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!state.isDrawing) return
      dispatch({ type: 'POINTER_MOVE', point: toLocalPoint(event) })
    }

    const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!state.isDrawing) return
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        // ignore
      }
      dispatch({ type: 'POINTER_UP' })
    }

    return (
      <canvas
        ref={canvasRef}
        className={
          state.previewMode
            ? 'drawing-overlay drawing-overlay--preview'
            : 'drawing-overlay'
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
    )
  },
)
