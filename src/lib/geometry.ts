export type Point = { x: number; y: number }

export type BBox = {
  x: number
  y: number
  width: number
  height: number
}

export type Stroke = {
  points: Point[]
}

export function strokeBBox(stroke: Stroke, padding = 4): BBox | null {
  if (stroke.points.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of stroke.points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return {
    x: minX - padding,
    y: minY - padding,
    width: Math.max(1, maxX - minX + padding * 2),
    height: Math.max(1, maxY - minY + padding * 2),
  }
}

export function unionBBox(boxes: BBox[]): BBox | null {
  if (boxes.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const b of boxes) {
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.width)
    maxY = Math.max(maxY, b.y + b.height)
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  }
}

export function strokesBBox(strokes: Stroke[], padding = 8): BBox | null {
  const boxes = strokes
    .map((s) => strokeBBox(s, padding))
    .filter((b): b is BBox => b !== null)
  return unionBBox(boxes)
}

export function clampBBox(bbox: BBox, width: number, height: number): BBox {
  const x = Math.max(0, Math.min(bbox.x, width))
  const y = Math.max(0, Math.min(bbox.y, height))
  const right = Math.max(x, Math.min(bbox.x + bbox.width, width))
  const bottom = Math.max(y, Math.min(bbox.y + bbox.height, height))
  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  }
}
