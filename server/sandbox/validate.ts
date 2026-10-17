const MAX_CODE_BYTES = 48_000
const MAX_ROUTES = 12
const MAX_DEPS = 8

const DANGEROUS_PATTERNS: { re: RegExp; reason: string }[] = [
  { re: /\bchild_process\b/, reason: 'child_process is not allowed' },
  { re: /\bworker_threads\b/, reason: 'worker_threads is not allowed' },
  { re: /\bcluster\b/, reason: 'cluster is not allowed' },
  { re: /\brequire\s*\(\s*['"]fs['"]/, reason: 'fs is not allowed' },
  { re: /\bfrom\s+['"]fs(?:\/promises)?['"]/, reason: 'fs is not allowed' },
  { re: /\bprocess\.env\b/, reason: 'process.env is not allowed' },
  { re: /\bprocess\.exit\b/, reason: 'process.exit is not allowed' },
  { re: /\bprocess\.kill\b/, reason: 'process.kill is not allowed' },
  { re: /\beval\s*\(/, reason: 'eval is not allowed' },
  { re: /\bnew\s+Function\b/, reason: 'Function constructor is not allowed' },
  { re: /\bFunction\s*\(/, reason: 'Function constructor is not allowed' },
  {
    re: /\b(?:global(?:This)?|globalThis)\s*\.\s*process\b/,
    reason: 'process access via global is not allowed',
  },
  {
    re: /(?:127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\])/i,
    reason: 'localhost / loopback network access is not allowed',
  },
  {
    re: /\bfile:\/\//i,
    reason: 'file:// URLs are not allowed',
  },
]

const PATH_RE = /^\/[a-zA-Z0-9/_-]{1,64}$/

export type BackendRouteInput = {
  path: string
  method: string
  code: string
  dependencies?: string[]
}

export function validateBackendRoute(route: BackendRouteInput, index: number): {
  path: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  code: string
  dependencies: string[]
} {
  if (!route || typeof route !== 'object') {
    throw new Error(`Backend route ${index} is invalid`)
  }

  const method = String(route.method || 'GET').toUpperCase()
  if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    throw new Error(`Backend route ${index} has invalid method`)
  }

  let path = String(route.path || '').trim()
  if (!path.startsWith('/')) path = `/${path}`
  if (!PATH_RE.test(path) || path.includes('..')) {
    throw new Error(
      `Backend route ${index} path must be like /my-route (letters, numbers, /, _, -)`,
    )
  }

  const code = String(route.code || '')
  if (!code.trim()) {
    throw new Error(`Backend route ${index} is missing code`)
  }
  if (Buffer.byteLength(code, 'utf8') > MAX_CODE_BYTES) {
    throw new Error(`Backend route ${index} code exceeds size limit`)
  }

  for (const { re, reason } of DANGEROUS_PATTERNS) {
    if (re.test(code)) {
      throw new Error(`Backend route ${index}: ${reason}`)
    }
  }

  const deps = Array.isArray(route.dependencies) ? route.dependencies : []
  if (deps.length > MAX_DEPS) {
    throw new Error(`Backend route ${index} lists too many dependencies`)
  }

  return {
    path,
    method: method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    code,
    dependencies: deps.map(String),
  }
}

export function validateBackendRoutes(routes: BackendRouteInput[]): ReturnType<
  typeof validateBackendRoute
>[] {
  if (!Array.isArray(routes)) {
    throw new Error('backend must be an array')
  }
  if (routes.length > MAX_ROUTES) {
    throw new Error(`At most ${MAX_ROUTES} backend routes allowed`)
  }
  return routes.map((route, i) => validateBackendRoute(route, i))
}

export { MAX_CODE_BYTES, MAX_ROUTES, MAX_DEPS }
