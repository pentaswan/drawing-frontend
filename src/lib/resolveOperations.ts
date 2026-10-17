import type { RemotePageOperation } from './api.ts'
import type { BBox } from './geometry.ts'
import { inferAlign, type Align } from './layout.ts'
import type { ExistingElementSnapshot } from './pageHtml.ts'
import {
  drawMidY,
  extractScripts,
  findInsertIndex,
  findNearestId,
  inferOpKind,
  type AppliedPageOp,
  type LayoutItem,
} from './pageOps.ts'

type Group = {
  id: string
  label: string
  bbox: BBox
}

function indexOfId(layout: LayoutItem[], id: string): number {
  return layout.findIndex((item) => item.id === id)
}

function resolveInsertIndex(
  group: Group,
  remote: Extract<RemotePageOperation, { op: 'add' }> | undefined,
  layout: LayoutItem[],
): number {
  const y = drawMidY(group.bbox)

  if (remote?.position === 'end') {
    return layout.length
  }

  if (remote?.anchorId) {
    const anchorIndex = indexOfId(layout, remote.anchorId)
    if (anchorIndex >= 0) {
      if (remote.position === 'before') return anchorIndex
      if (remote.position === 'after') return anchorIndex + 1
    }
  }

  return findInsertIndex(y, layout)
}

export function resolveOperations(args: {
  groups: Group[]
  remoteOps: RemotePageOperation[]
  existing: ExistingElementSnapshot[]
  pageWidth: number
}): AppliedPageOp[] {
  const { groups, remoteOps, existing, pageWidth } = args
  const byGroup = new Map(remoteOps.map((op) => [op.groupId, op] as const))

  let layout: LayoutItem[] = existing.map((el) => ({
    id: el.id,
    yMid: el.yMid,
  }))

  const applied: AppliedPageOp[] = []

  for (const group of groups) {
    const remote = byGroup.get(group.id)
    const y = drawMidY(group.bbox)
    const hasTargets = layout.length > 0

    let kind: 'add' | 'replace' | 'remove' =
      remote?.op ?? inferOpKind(group.label, hasTargets)

    if ((kind === 'replace' || kind === 'remove') && !hasTargets) {
      kind = 'add'
    }

    if (kind === 'remove') {
      const targetId =
        (remote?.op === 'remove' ? remote.targetId : undefined) ||
        findNearestId(y, layout)
      if (!targetId) continue
      applied.push({ op: 'remove', targetId })
      layout = layout.filter((item) => item.id !== targetId)
      continue
    }

    if (kind === 'replace') {
      if (remote?.op !== 'replace') continue
      const targetId = remote.targetId || findNearestId(y, layout)
      if (!targetId) continue

      const split = extractScripts(remote.html)
      const script =
        remote.script === null
          ? null
          : remote.script || split.script || undefined

      applied.push({
        op: 'replace',
        targetId,
        html: split.html,
        align: remote.align ?? inferAlign(group.bbox, pageWidth),
        script,
      })
      continue
    }

    const htmlSource =
      remote?.op === 'add' ? remote.html : `<p>${group.label}</p>`
    const split = extractScripts(htmlSource)
    const script =
      remote?.op === 'add' ? remote.script || split.script : split.script
    const align: Align =
      remote?.op === 'add'
        ? remote.align
        : inferAlign(group.bbox, pageWidth)

    const insertIndex = resolveInsertIndex(
      group,
      remote?.op === 'add' ? remote : undefined,
      layout,
    )

    const placeholderId = `__pending_${group.id}`
    layout = [
      ...layout.slice(0, insertIndex),
      { id: placeholderId, yMid: y },
      ...layout.slice(insertIndex),
    ]

    applied.push({
      op: 'add',
      html: split.html,
      align,
      script,
      insertIndex,
    })
  }

  return applied
}
