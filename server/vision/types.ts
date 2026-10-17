export type BBox = {
  x: number
  y: number
  width: number
  height: number
}

export type Align = 'left' | 'center' | 'right'

export type LabeledGroup = {
  id: string
  label: string
  bbox: BBox
}

export type ExistingElement = {
  id: string
  index: number
  align: Align
  html: string
  yTop: number
  yBottom: number
  yMid: number
}

export type GenerateRequest = {
  imageBase64: string
  pageWidth: number
  pageHeight: number
  groups: LabeledGroup[]
  existingElements?: ExistingElement[]
  existingHtml?: string
  provider?: string
}

export type PageOperation =
  | {
      op: 'add'
      groupId: string
      html: string
      align: Align
      script?: string
      /** Existing element id to insert near; client may override from draw Y. */
      anchorId?: string | null
      position?: 'before' | 'after' | 'end'
    }
  | {
      op: 'replace'
      groupId: string
      targetId: string
      html: string
      align?: Align
      script?: string | null
    }
  | {
      op: 'remove'
      groupId: string
      targetId: string
    }

export type GenerateResponse = {
  operations: PageOperation[]
}

export interface VisionProvider {
  id: string
  generate(req: GenerateRequest): Promise<GenerateResponse>
}
