/**
 * Child-process entry for one sandboxed backend request.
 * Reads a JSON payload path from argv[2] (or stdin when argv[2] is "-").
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')

const ALLOWED_BUILTINS = new Set([
  'assert',
  'buffer',
  'crypto',
  'events',
  'http',
  'https',
  'net',
  'path',
  'querystring',
  'stream',
  'string_decoder',
  'timers',
  'tls',
  'url',
  'util',
  'zlib',
])

const BLOCKED_BUILTINS = new Set([
  'child_process',
  'cluster',
  'dgram',
  'fs',
  'fs/promises',
  'module',
  'os',
  'v8',
  'vm',
  'worker_threads',
])

function installRequireGuard(sandboxDir) {
  const sandboxRoot = path.resolve(sandboxDir)
  const originalLoad = Module._load

  Module._load = function guardedLoad(request, parent, _isMain) {
    const id = String(request)

    if (id === 'fs' || id === 'fs/promises' || id.startsWith('node:fs')) {
      throw new Error(`Module "${id}" is blocked in the sandbox`)
    }
    if (id.startsWith('node:')) {
      const bare = id.slice(5)
      if (BLOCKED_BUILTINS.has(bare) || !ALLOWED_BUILTINS.has(bare)) {
        throw new Error(`Builtin "${id}" is not allowed in the sandbox`)
      }
      return originalLoad.apply(this, arguments)
    }
    if (BLOCKED_BUILTINS.has(id)) {
      throw new Error(`Module "${id}" is blocked in the sandbox`)
    }
    if (ALLOWED_BUILTINS.has(id)) {
      return originalLoad.apply(this, arguments)
    }

    // Relative requires must stay inside the sandbox
    if (id.startsWith('.') || id.startsWith('/') || path.isAbsolute(id)) {
      const resolved = path.resolve(
        parent?.filename ? path.dirname(parent.filename) : sandboxRoot,
        id,
      )
      if (!resolved.startsWith(sandboxRoot)) {
        throw new Error('Relative require escaped the sandbox')
      }
      return originalLoad.apply(this, arguments)
    }

    // Package imports: only from sandbox node_modules
    try {
      const resolved = require.resolve(id, { paths: [sandboxRoot] })
      if (!resolved.startsWith(sandboxRoot)) {
        throw new Error(`Package "${id}" resolved outside sandbox`)
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('outside sandbox')) {
        throw error
      }
      // fall through to originalLoad which will throw MODULE_NOT_FOUND
    }

    return originalLoad.apply(this, arguments)
  }
}

function buildRes() {
  const state = {
    statusCode: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: null,
    status(code) {
      state.statusCode = code
      return state
    },
    setHeader(key, value) {
      state.headers[String(key).toLowerCase()] = String(value)
      return state
    },
    json(data) {
      state.headers['content-type'] = 'application/json; charset=utf-8'
      state.body = data
    },
    text(data) {
      state.headers['content-type'] = 'text/plain; charset=utf-8'
      state.body = data
    },
    send(data) {
      state.body = data
    },
  }
  return state
}

async function main() {
  const raw =
    process.argv[2] && process.argv[2] !== '-'
      ? fs.readFileSync(process.argv[2], 'utf8')
      : fs.readFileSync(0, 'utf8')

  const payload = JSON.parse(raw)
  const sandboxDir = path.resolve(payload.sandboxDir)
  installRequireGuard(sandboxDir)

  // Strip secrets from the child environment (parent already launches with clean env,
  // but belt-and-suspenders here).
  for (const key of Object.keys(process.env)) {
    if (/key|secret|token|password|credential/i.test(key)) {
      delete process.env[key]
    }
  }

  // eslint-disable-next-line import/no-dynamic-require
  const mod = require(path.resolve(payload.routeFile))
  const handler =
    typeof mod === 'function'
      ? mod
      : typeof mod?.default === 'function'
        ? mod.default
        : typeof mod?.handler === 'function'
          ? mod.handler
          : null

  if (typeof handler !== 'function') {
    throw new Error('Backend route must export async function handler(req, res)')
  }

  const res = buildRes()
  const req = {
    method: payload.method,
    path: payload.urlPath,
    query: payload.query || {},
    headers: payload.headers || {},
    body: payload.body ?? null,
  }

  await handler(req, res)

  process.stdout.write(
    JSON.stringify({
      ok: true,
      status: res.statusCode,
      headers: res.headers,
      body: res.body,
    }),
  )
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stdout.write(JSON.stringify({ ok: false, error: message }))
  process.exitCode = 1
})
