import type { RefObject } from 'react'
import type { DrawingOverlayHandle } from '../components/DrawingOverlay.tsx'
import type { SealedGroup } from '../state/drawingStore.tsx'
import { generateElements, sendGlobalChat } from './api.ts'
import { strokesBBox } from './geometry.ts'
import { inferAlign } from './layout.ts'
import { getExistingPageHtml, getPageSnapshot } from './pageHtml.ts'
import {
  resolveGlobalOperations,
  resolveOperations,
} from './resolveOperations.ts'
import type { AppliedPageOp } from './pageOps.ts'
import { getSessionId } from './session.ts'

function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

export async function runGeneration(args: {
  overlayRef: RefObject<DrawingOverlayHandle | null>
  provider: string
  group: SealedGroup
  pageCss?: string
}): Promise<AppliedPageOp[]> {
  const overlay = args.overlayRef.current
  if (!overlay) {
    throw new Error('Drawing canvas is not ready')
  }

  const imageBase64 = overlay.exportAnnotatedPng()
  const { width, height } = overlay.getSize()
  if (!imageBase64 || width <= 0 || height <= 0) {
    throw new Error('Could not capture the drawing canvas')
  }

  const existing = getPageSnapshot()
  const result = await generateElements({
    imageBase64,
    pageWidth: width,
    pageHeight: height,
    groups: [
      {
        id: args.group.id,
        label: args.group.label,
        bbox: args.group.bbox,
      },
    ],
    existingElements: existing,
    existingHtml: getExistingPageHtml() || undefined,
    pageCss: args.pageCss,
    sessionId: getSessionId(),
    provider: args.provider,
  })

  const operations = resolveOperations({
    groups: [args.group],
    remoteOps: result.operations ?? [],
    existing,
    pageWidth: width,
  })

  if (operations.length === 0 && !(result.backend && result.backend.length)) {
    throw new Error('Model returned no usable page operations')
  }

  // Ensure add ops still get alignment from the sketch if missing.
  return operations.map((op) => {
    if (op.op !== 'add') return op
    return {
      ...op,
      align: op.align ?? inferAlign(args.group.bbox, width),
    }
  })
}

export async function runGlobalChat(args: {
  message: string
  provider: string
  pageCss?: string
}): Promise<AppliedPageOp[]> {
  const existing = getPageSnapshot()
  const result = await sendGlobalChat({
    message: args.message,
    existingElements: existing,
    existingHtml: getExistingPageHtml() || undefined,
    pageCss: args.pageCss,
    sessionId: getSessionId(),
    provider: args.provider,
  })

  const operations = resolveGlobalOperations(result.operations ?? [], existing)

  if (operations.length === 0 && !(result.backend && result.backend.length)) {
    throw new Error('Model returned no usable page operations')
  }

  return operations
}

export function buildGroupFromOpenStrokes(
  openStrokes: SealedGroup['strokes'],
  label: string,
): SealedGroup | null {
  const bbox = strokesBBox(openStrokes)
  if (!bbox || !label.trim()) return null
  return {
    id: createId('group'),
    strokes: openStrokes,
    label: label.trim(),
    bbox,
  }
}
