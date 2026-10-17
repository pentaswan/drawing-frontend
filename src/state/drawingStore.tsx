import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react'
import { strokesBBox, type BBox, type Point, type Stroke } from '../lib/geometry.ts'
import type { Align } from '../lib/layout.ts'
import type { AppliedPageOp } from '../lib/pageOps.ts'
import { getSessionId } from '../lib/session.ts'

const MAX_HISTORY = 50

export type SealedGroup = {
  id: string
  strokes: Stroke[]
  label: string
  bbox: BBox
}

export type GeneratedElement = {
  id: string
  html: string
  align: Align
  script?: string
  /** Bumps when html/script change so effects re-run. */
  revision: number
}

/** Restorable editor snapshot (drawings + page). */
export type HistorySnapshot = {
  openStrokes: Stroke[]
  sealedGroups: SealedGroup[]
  labelDraft: string
  showPrompt: boolean
  generatedElements: GeneratedElement[]
  pageCss: string
}

export type DrawingState = {
  openStrokes: Stroke[]
  sealedGroups: SealedGroup[]
  currentPoints: Point[] | null
  isDrawing: boolean
  showPrompt: boolean
  labelDraft: string
  generatedElements: GeneratedElement[]
  pageCss: string
  sessionId: string
  isGenerating: boolean
  isGlobalChatting: boolean
  previewMode: boolean
  error: string | null
  provider: string
  history: HistorySnapshot[]
}

type Action =
  | { type: 'POINTER_DOWN'; point: Point }
  | { type: 'POINTER_MOVE'; point: Point }
  | { type: 'POINTER_UP' }
  | { type: 'SET_LABEL'; label: string }
  | { type: 'DISCARD_OPEN' }
  | { type: 'UNDO' }
  | { type: 'CLEAR_INK' }
  | { type: 'CLEAR_PAGE' }
  | { type: 'SET_PROVIDER'; provider: string }
  | { type: 'TOGGLE_PREVIEW' }
  | { type: 'SET_PREVIEW'; enabled: boolean }
  | { type: 'GENERATE_START' }
  | { type: 'GLOBAL_CHAT_START' }
  | { type: 'APPLY_OPERATIONS'; operations: AppliedPageOp[] }
  | { type: 'GENERATE_ERROR'; error: string }
  | { type: 'CLEAR_ERROR' }

function enterPreview(state: DrawingState): DrawingState {
  return {
    ...state,
    previewMode: true,
    isDrawing: false,
    currentPoints: null,
    showPrompt: false,
  }
}

function exitPreview(state: DrawingState): DrawingState {
  return {
    ...state,
    previewMode: false,
    showPrompt: state.openStrokes.length > 0,
  }
}

function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function takeSnapshot(state: DrawingState): HistorySnapshot {
  return {
    openStrokes: state.openStrokes,
    sealedGroups: state.sealedGroups,
    labelDraft: state.labelDraft,
    showPrompt: state.showPrompt,
    generatedElements: state.generatedElements,
    pageCss: state.pageCss,
  }
}

function pushHistory(state: DrawingState): DrawingState {
  const history = [...state.history, takeSnapshot(state)].slice(-MAX_HISTORY)
  return { ...state, history }
}

function applyOperations(
  elements: GeneratedElement[],
  pageCss: string,
  operations: AppliedPageOp[],
): { elements: GeneratedElement[]; pageCss: string } {
  let next = [...elements]
  let css = pageCss
  for (const op of operations) {
    if (op.op === 'pageStyle') {
      css = op.css
      continue
    }
    if (op.op === 'remove') {
      next = next.filter((el) => el.id !== op.targetId)
      continue
    }
    if (op.op === 'replace') {
      next = next.map((el) => {
        if (el.id !== op.targetId) return el
        return {
          ...el,
          html: op.html,
          align: op.align ?? el.align,
          script:
            op.script === null
              ? undefined
              : op.script !== undefined
                ? op.script
                : el.script,
          revision: el.revision + 1,
        }
      })
      continue
    }
    const insertAt = Math.max(0, Math.min(op.insertIndex, next.length))
    const created: GeneratedElement = {
      id: createId('el'),
      html: op.html,
      align: op.align,
      script: op.script,
      revision: 1,
    }
    next = [...next.slice(0, insertAt), created, ...next.slice(insertAt)]
  }
  return { elements: next, pageCss: css }
}

export const initialDrawingState: DrawingState = {
  openStrokes: [],
  sealedGroups: [],
  currentPoints: null,
  isDrawing: false,
  showPrompt: false,
  labelDraft: '',
  generatedElements: [],
  pageCss: '',
  sessionId: '',
  isGenerating: false,
  isGlobalChatting: false,
  previewMode: false,
  error: null,
  provider: 'perceptron',
  history: [],
}

export function drawingReducer(state: DrawingState, action: Action): DrawingState {
  switch (action.type) {
    case 'POINTER_DOWN':
      if (state.previewMode || state.isGenerating || state.isGlobalChatting) {
        return state
      }
      return {
        ...state,
        isDrawing: true,
        showPrompt: false,
        currentPoints: [action.point],
        error: null,
      }
    case 'POINTER_MOVE':
      if (!state.isDrawing || !state.currentPoints) return state
      return {
        ...state,
        currentPoints: [...state.currentPoints, action.point],
      }
    case 'POINTER_UP': {
      if (!state.currentPoints || state.currentPoints.length === 0) {
        return {
          ...state,
          isDrawing: false,
          currentPoints: null,
          showPrompt: state.openStrokes.length > 0,
        }
      }
      const stroke: Stroke = { points: state.currentPoints }
      const withHistory = pushHistory(state)
      const openStrokes = [...withHistory.openStrokes, stroke]
      return {
        ...withHistory,
        openStrokes,
        currentPoints: null,
        isDrawing: false,
        showPrompt: true,
      }
    }
    case 'SET_LABEL':
      return { ...state, labelDraft: action.label }
    case 'DISCARD_OPEN': {
      if (
        state.openStrokes.length === 0 &&
        !state.currentPoints &&
        !state.labelDraft
      ) {
        return state
      }
      const withHistory = pushHistory(state)
      return {
        ...withHistory,
        openStrokes: [],
        currentPoints: null,
        isDrawing: false,
        showPrompt: false,
        labelDraft: '',
      }
    }
    case 'UNDO': {
      if (state.currentPoints) {
        return {
          ...state,
          currentPoints: null,
          isDrawing: false,
          showPrompt: state.openStrokes.length > 0,
        }
      }
      if (state.history.length === 0) return state
      const prev = state.history[state.history.length - 1]
      return {
        ...state,
        openStrokes: prev.openStrokes,
        sealedGroups: prev.sealedGroups,
        labelDraft: prev.labelDraft,
        showPrompt: prev.openStrokes.length > 0,
        generatedElements: prev.generatedElements,
        pageCss: prev.pageCss,
        history: state.history.slice(0, -1),
        currentPoints: null,
        isDrawing: false,
        isGenerating: false,
        isGlobalChatting: false,
        error: null,
      }
    }
    case 'CLEAR_INK': {
      if (
        state.openStrokes.length === 0 &&
        state.sealedGroups.length === 0 &&
        !state.currentPoints
      ) {
        return state
      }
      const withHistory = pushHistory(state)
      return {
        ...withHistory,
        openStrokes: [],
        sealedGroups: [],
        currentPoints: null,
        isDrawing: false,
        showPrompt: false,
        labelDraft: '',
      }
    }
    case 'CLEAR_PAGE': {
      const withHistory = pushHistory(state)
      return {
        ...initialDrawingState,
        sessionId: state.sessionId,
        provider: state.provider,
        history: withHistory.history,
      }
    }
    case 'SET_PROVIDER':
      return { ...state, provider: action.provider }
    case 'TOGGLE_PREVIEW':
      return state.previewMode ? exitPreview(state) : enterPreview(state)
    case 'SET_PREVIEW':
      if (action.enabled === state.previewMode) return state
      return action.enabled ? enterPreview(state) : exitPreview(state)
    case 'GENERATE_START':
      return {
        ...state,
        isGenerating: true,
        error: null,
        showPrompt: false,
        previewMode: false,
      }
    case 'GLOBAL_CHAT_START':
      return {
        ...state,
        isGlobalChatting: true,
        error: null,
      }
    case 'APPLY_OPERATIONS': {
      if (action.operations.length === 0) {
        return {
          ...state,
          isGenerating: false,
          isGlobalChatting: false,
        }
      }
      const withHistory = pushHistory(state)
      const applied = applyOperations(
        state.generatedElements,
        state.pageCss,
        action.operations,
      )
      return {
        ...withHistory,
        isGenerating: false,
        isGlobalChatting: false,
        sealedGroups: [],
        openStrokes: [],
        currentPoints: null,
        showPrompt: false,
        labelDraft: '',
        generatedElements: applied.elements,
        pageCss: applied.pageCss,
      }
    }
    case 'GENERATE_ERROR':
      return {
        ...state,
        isGenerating: false,
        isGlobalChatting: false,
        error: action.error,
        showPrompt: state.openStrokes.length > 0,
      }
    case 'CLEAR_ERROR':
      return { ...state, error: null }
    default:
      return state
  }
}

type DrawingContextValue = {
  state: DrawingState
  dispatch: Dispatch<Action>
  openBBox: BBox | null
  canUndo: boolean
}

const DrawingContext = createContext<DrawingContextValue | null>(null)

export function DrawingProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(drawingReducer, undefined, () => ({
    ...initialDrawingState,
    sessionId: getSessionId(),
  }))

  const value = useMemo<DrawingContextValue>(() => {
    const liveStroke = state.currentPoints
      ? [{ points: state.currentPoints }]
      : []
    const openBBox = strokesBBox([...state.openStrokes, ...liveStroke])
    const canUndo =
      !state.isGenerating &&
      !state.isGlobalChatting &&
      !state.previewMode &&
      (state.history.length > 0 || Boolean(state.currentPoints))

    return { state, dispatch, openBBox, canUndo }
  }, [state])

  return (
    <DrawingContext.Provider value={value}>{children}</DrawingContext.Provider>
  )
}

export function useDrawing(): DrawingContextValue {
  const ctx = useContext(DrawingContext)
  if (!ctx) {
    throw new Error('useDrawing must be used within DrawingProvider')
  }
  return ctx
}
