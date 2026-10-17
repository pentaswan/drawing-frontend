import { spawn } from 'node:child_process'
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { assertAllowedPackage } from './allowlist.ts'
import {
  validateBackendRoutes,
  type BackendRouteInput,
} from './validate.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../..')
const SANDBOX_ROOT = resolve(ROOT, 'sandboxes')
const RUNNER = resolve(__dirname, 'runner.cjs')
const REQUEST_TIMEOUT_MS = Number(process.env.SANDBOX_TIMEOUT_MS || 12_000)
const INSTALL_TIMEOUT_MS = Number(process.env.SANDBOX_INSTALL_TIMEOUT_MS || 60_000)

export type DeployedRoute = {
  path: string
  method: string
  dependencies: string[]
}

function sessionDir(sessionId: string): string {
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(sessionId)) {
    throw new Error('Invalid session id')
  }
  return join(SANDBOX_ROOT, sessionId)
}

function routeFileName(method: string, routePath: string): string {
  const safe = routePath.replace(/^\//, '').replace(/\//g, '__')
  return `${method.toUpperCase()}__${safe}.cjs`
}

function ensureSession(sessionId: string): string {
  const dir = sessionDir(sessionId)
  mkdirSync(join(dir, 'routes'), { recursive: true })
  const pkgPath = join(dir, 'package.json')
  if (!existsSync(pkgPath)) {
    writeFileSync(
      pkgPath,
      JSON.stringify(
        {
          name: `inkframe-sandbox-${sessionId.slice(0, 8)}`,
          private: true,
          type: 'commonjs',
          dependencies: {},
        },
        null,
        2,
      ),
    )
  }
  return dir
}

async function npmInstall(dir: string, packages: string[]): Promise<void> {
  if (packages.length === 0) return

  const unique = [...new Set(packages.map(assertAllowedPackage))]
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
  }
  pkg.dependencies = pkg.dependencies || {}
  for (const name of unique) {
    pkg.dependencies[name] = pkg.dependencies[name] || '*'
  }
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg, null, 2))

  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--omit=dev',
        ...unique,
      ],
      {
        cwd: dir,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          npm_config_update_notifier: 'false',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )

    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('npm install timed out'))
    }, INSTALL_TIMEOUT_MS)

    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolvePromise()
      else reject(new Error(`npm install failed: ${stderr.slice(0, 500)}`))
    })
  })
}

function wrapHandlerCode(code: string): string {
  const trimmed = code.trim()
  // If the model already exported a handler, keep as-is (still wrapped carefully).
  if (
    /\bmodule\.exports\b/.test(trimmed) ||
    /\bexports\.handler\b/.test(trimmed) ||
    /\bfunction\s+handler\b/.test(trimmed) ||
    /\bconst\s+handler\b/.test(trimmed) ||
    /\blet\s+handler\b/.test(trimmed)
  ) {
    return `${trimmed}\n;module.exports = typeof handler === 'function' ? handler : (module.exports.handler || module.exports.default || module.exports);\n`
  }

  return `"use strict";\nmodule.exports = async function handler(req, res) {\n${trimmed}\n};\n`
}

export async function deployBackend(args: {
  sessionId: string
  routes: BackendRouteInput[]
}): Promise<{ sessionId: string; routes: DeployedRoute[]; apiBase: string }> {
  const validated = validateBackendRoutes(args.routes)
  const dir = ensureSession(args.sessionId)

  const allDeps = validated.flatMap((r) => r.dependencies)
  await npmInstall(dir, allDeps)

  const deployed: DeployedRoute[] = []
  for (const route of validated) {
    const file = join(dir, 'routes', routeFileName(route.method, route.path))
    writeFileSync(file, wrapHandlerCode(route.code), 'utf8')
    deployed.push({
      path: route.path,
      method: route.method,
      dependencies: route.dependencies,
    })
  }

  const manifestPath = join(dir, 'manifest.json')
  const existing = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        routes?: DeployedRoute[]
      })
    : { routes: [] }
  const byKey = new Map(
    (existing.routes || []).map((r) => [`${r.method}:${r.path}`, r] as const),
  )
  for (const r of deployed) {
    byKey.set(`${r.method}:${r.path}`, r)
  }
  const merged = [...byKey.values()]
  writeFileSync(
    manifestPath,
    JSON.stringify({ routes: merged, updatedAt: Date.now() }, null, 2),
  )

  return {
    sessionId: args.sessionId,
    routes: merged,
    apiBase: `/api/u/${args.sessionId}`,
  }
}

export function listRoutes(sessionId: string): DeployedRoute[] {
  const dir = sessionDir(sessionId)
  const manifestPath = join(dir, 'manifest.json')
  if (!existsSync(manifestPath)) return []
  const data = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    routes?: DeployedRoute[]
  }
  return data.routes || []
}

export function resetSandbox(sessionId: string): void {
  const dir = sessionDir(sessionId)
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true })
  }
}

export function createSessionId(): string {
  return randomUUID().replace(/-/g, '')
}

export async function invokeSandbox(args: {
  sessionId: string
  method: string
  routePath: string
  query: Record<string, string>
  headers: Record<string, string>
  body: unknown
}): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
  const dir = sessionDir(args.sessionId)
  const file = join(
    dir,
    'routes',
    routeFileName(args.method, args.routePath),
  )
  if (!existsSync(file)) {
    return {
      status: 404,
      headers: { 'content-type': 'application/json' },
      body: { error: `No handler for ${args.method} ${args.routePath}` },
    }
  }

  const payloadPath = join(dir, `.invoke-${randomUUID()}.json`)
  writeFileSync(
    payloadPath,
    JSON.stringify({
      sandboxDir: dir,
      routeFile: file,
      method: args.method.toUpperCase(),
      urlPath: args.routePath,
      query: args.query,
      headers: args.headers,
      body: args.body,
    }),
  )

  try {
    const result = await new Promise<{
      ok: boolean
      status?: number
      headers?: Record<string, string>
      body?: unknown
      error?: string
    }>((resolvePromise, reject) => {
      const child = spawn(process.execPath, [RUNNER, payloadPath], {
        cwd: dir,
        env: {
          PATH: process.env.PATH,
          NODE_ENV: 'production',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (c: Buffer) => {
        stdout += c.toString()
      })
      child.stderr.on('data', (c: Buffer) => {
        stderr += c.toString()
      })

      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new Error('Sandbox request timed out'))
      }, REQUEST_TIMEOUT_MS)

      child.on('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.on('close', () => {
        clearTimeout(timer)
        try {
          const parsed = JSON.parse(stdout || '{}') as {
            ok: boolean
            status?: number
            headers?: Record<string, string>
            body?: unknown
            error?: string
          }
          if (!parsed.ok) {
            resolvePromise({
              ok: false,
              error: parsed.error || stderr.slice(0, 400) || 'Sandbox failed',
            })
            return
          }
          resolvePromise(parsed)
        } catch {
          reject(
            new Error(
              stderr.slice(0, 400) || 'Sandbox returned invalid JSON',
            ),
          )
        }
      })
    })

    if (!result.ok) {
      return {
        status: 500,
        headers: { 'content-type': 'application/json' },
        body: { error: result.error || 'Sandbox error' },
      }
    }

    return {
      status: result.status || 200,
      headers: result.headers || { 'content-type': 'application/json' },
      body: result.body,
    }
  } finally {
    try {
      rmSync(payloadPath, { force: true })
    } catch {
      // ignore
    }
  }
}

export { SANDBOX_ROOT }
