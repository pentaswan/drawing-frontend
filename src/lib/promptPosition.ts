import { clampBBox, type BBox } from './geometry.ts'

export function promptPosition(
  bbox: BBox | null,
  containerWidth: number,
  containerHeight: number,
): { left: number; top: number } {
  if (!bbox) return { left: 16, top: 16 }
  const panelWidth = 280
  const panelHeight = 120
  const left = Math.min(
    Math.max(8, bbox.x),
    Math.max(8, containerWidth - panelWidth - 8),
  )
  let top = bbox.y + bbox.height + 10
  if (top + panelHeight > containerHeight - 8) {
    top = Math.max(8, bbox.y - panelHeight - 10)
  }
  const clamped = clampBBox(
    { x: left, y: top, width: panelWidth, height: panelHeight },
    containerWidth,
    containerHeight,
  )
  return { left: clamped.x, top: clamped.y }
}
