const STORAGE_KEY = 'inkframe_session_id'

function createId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '')
  }
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
}

export function getSessionId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY)
    if (existing && /^[a-zA-Z0-9_-]{8,64}$/.test(existing)) {
      return existing
    }
  } catch {
    // ignore
  }
  const id = createId()
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // ignore
  }
  return id
}

export function apiBaseForSession(sessionId: string = getSessionId()): string {
  return `/api/u/${sessionId}`
}
