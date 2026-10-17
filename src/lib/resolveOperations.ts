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

  // Global pageStyle ops (no stroke group) applied first
  for (const remote of remoteOps) {
    if (remote.op === 'pageStyle' && !groups.some((g) => g.id === remote.groupId)) {
      applied.push({ op: 'pageStyle', css: remote.css })
    }
  }

  for (const group of groups) {
    const remote = byGroup.get(group.id)
    const y = drawMidY(group.bbox)
    const hasTargets = layout.length > 0

    if (remote?.op === 'pageStyle') {
      applied.push({ op: 'pageStyle', css: remote.css })
      continue
    }

    let kind: 'add' | 'replace' | 'remove' =
      remote?.op === 'add' || remote?.op === 'replace' || remote?.op === 'remove'
        ? remote.op
        : inferOpKind(group.label, hasTargets)

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

/** Resolve remote ops from global chat (no stroke groups). */
export function resolveGlobalOperations(
  remoteOps: RemotePageOperation[],
  existing: ExistingElementSnapshot[],
): AppliedPageOp[] {
  let layout: LayoutItem[] = existing.map((el) => ({
    id: el.id,
    yMid: el.yMid,
  }))
  const applied: AppliedPageOp[] = []

  for (const remote of remoteOps) {
    if (remote.op === 'pageStyle') {
      applied.push({ op: 'pageStyle', css: remote.css })
      continue
    }

    if (remote.op === 'remove') {
      if (!remote.targetId) continue
      applied.push({ op: 'remove', targetId: remote.targetId })
      layout = layout.filter((item) => item.id !== remote.targetId)
      continue
    }

    if (remote.op === 'replace') {
      const split = extractScripts(remote.html)
      applied.push({
        op: 'replace',
        targetId: remote.targetId,
        html: split.html,
        align: remote.align,
        script:
          remote.script === null
            ? null
            : remote.script || split.script || undefined,
      })
      continue
    }

    if (remote.op === 'add') {
      const split = extractScripts(remote.html)
      let insertIndex = layout.length
      if (remote.anchorId) {
        const anchorIndex = indexOfId(layout, remote.anchorId)
        if (anchorIndex >= 0) {
          insertIndex =
            remote.position === 'before' ? anchorIndex : anchorIndex + 1
        }
      } else if (remote.position === 'end') {
        insertIndex = layout.length
      }

      const placeholderId = `__pending_${remote.groupId}`
      layout = [
        ...layout.slice(0, insertIndex),
        { id: placeholderId, yMid: insertIndex },
        ...layout.slice(insertIndex),
      ]

      applied.push({
        op: 'add',
        html: split.html,
        align: remote.align || 'center',
        script: remote.script || split.script,
        insertIndex,
      })
    }
  }

  return applied
}
