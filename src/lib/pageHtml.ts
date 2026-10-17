import type { Align } from './layout.ts'

export type ExistingElementSnapshot = {
  id: string
  index: number
  align: Align
  html: string
  yTop: number
  yBottom: number
  yMid: number
}

export function getPageSnapshot(
  siteEl: HTMLElement | null = document.querySelector('.site'),
): ExistingElementSnapshot[] {
  if (!siteEl) return []
  const siteRect = siteEl.getBoundingClientRect()
  return Array.from(siteEl.querySelectorAll<HTMLElement>('.page-block')).map(
    (el, index) => {
      const r = el.getBoundingClientRect()
      const yTop = r.top - siteRect.top
      const yBottom = r.bottom - siteRect.top
      const align = (el.dataset.align as Align | undefined) ?? 'center'
      return {
        id: el.dataset.elementId || el.id || `missing_${index}`,
        index,
        align,
        html: el.innerHTML,
        yTop,
        yBottom,
        yMid: (yTop + yBottom) / 2,
      }
    },
  )
}

export function getExistingPageHtml(): string {
  return getPageSnapshot()
    .map(
      (el) =>
        `<!-- id:${el.id} align:${el.align} yMid:${Math.round(el.yMid)} -->\n${el.html}`,
    )
    .join('\n')
}
