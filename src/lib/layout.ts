import type { BBox } from './geometry.ts'

export type Align = 'left' | 'center' | 'right'

/** Infer horizontal alignment from where the user drew on the page. */
export function inferAlign(bbox: BBox, pageWidth: number): Align {
  if (pageWidth <= 0) return 'center'
  const mid = bbox.x + bbox.width / 2
  const rel = mid / pageWidth
  // Wide blocks (hero, nav, full sections) stay centered in the flow.
  if (bbox.width / pageWidth >= 0.72) return 'center'
  if (rel < 0.38) return 'left'
  if (rel > 0.62) return 'right'
  return 'center'
}

export function sortByReadingOrder<T extends { bbox: BBox }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x,
  )
}
