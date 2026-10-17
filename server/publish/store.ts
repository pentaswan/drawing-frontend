import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listRoutes, type DeployedRoute } from '../sandbox/manager.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../..')
const PUBLISHED_ROOT = resolve(ROOT, 'published')
const SANDBOX_ROOT = resolve(ROOT, 'sandboxes')

const RESERVED_SLUGS = new Set([
  'api',
  'src',
  'assets',
  'public',
  'favicon',
  'favicon.svg',
  'node_modules',
  'static',
  'editor',
  'index',
  'robots.txt',
  'vite.svg',
  '@vite',
  '@react-refresh',
  'health',
])

/** Alphanumeric plus hyphen and underscore; 1–48 chars. */
const SLUG_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$/

export type PublishedElement = {
  id: string
  html: string
  align: 'left' | 'center' | 'right'
  script?: string
}

export type PublishedSite = {
  slug: string
  title: string
  pageCss: string
  elements: PublishedElement[]
  sandboxSessionId: string
  routes: DeployedRoute[]
  publishedAt: number
}

export function assertValidSlug(raw: string): string {
  const slug = raw.trim()
  if (!SLUG_RE.test(slug)) {
    throw new Error(
      'Name must start with a letter or number and use only letters, numbers, hyphens, and underscores (max 48 chars)',
    )
  }
  if (RESERVED_SLUGS.has(slug.toLowerCase())) {
    throw new Error(`Name "${slug}" is reserved`)
  }
  return slug
}

export function publishedSandboxId(slug: string): string {
  return `published_${slug}`
}

function siteDir(slug: string): string {
  return join(PUBLISHED_ROOT, slug)
}

function sitePath(slug: string): string {
  return join(siteDir(slug), 'site.json')
}

function copySandbox(sourceSessionId: string, destSessionId: string): void {
  const src = join(SANDBOX_ROOT, sourceSessionId)
  const dest = join(SANDBOX_ROOT, destSessionId)
  if (existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true })
  }
  if (!existsSync(src)) {
    // No backend yet — create an empty sandbox shell
    mkdirSync(join(dest, 'routes'), { recursive: true })
    writeFileSync(
      join(dest, 'package.json'),
      JSON.stringify(
        {
          name: `inkframe-sandbox-${destSessionId.slice(0, 12)}`,
          private: true,
          type: 'commonjs',
          dependencies: {},
        },
        null,
        2,
      ),
    )
    writeFileSync(
      join(dest, 'manifest.json'),
      JSON.stringify({ routes: [], updatedAt: Date.now() }, null, 2),
    )
    return
  }
  mkdirSync(dirname(dest), { recursive: true })
  cpSync(src, dest, { recursive: true })
}

export function publishSite(args: {
  slug: string
  title?: string
  pageCss: string
  elements: PublishedElement[]
  sourceSessionId: string
}): PublishedSite {
  const slug = assertValidSlug(args.slug)
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(args.sourceSessionId)) {
    throw new Error('Invalid session id')
  }

  const sandboxSessionId = publishedSandboxId(slug)
  copySandbox(args.sourceSessionId, sandboxSessionId)

  const site: PublishedSite = {
    slug,
    title: (args.title || slug).trim() || slug,
    pageCss: args.pageCss || '',
    elements: args.elements,
    sandboxSessionId,
    routes: listRoutes(sandboxSessionId),
    publishedAt: Date.now(),
  }

  mkdirSync(siteDir(slug), { recursive: true })
  writeFileSync(sitePath(slug), JSON.stringify(site, null, 2))
  return site
}

export function getPublishedSite(slug: string): PublishedSite | null {
  const normalized = assertValidSlug(slug)
  const path = sitePath(normalized)
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf8')) as PublishedSite
}

export function tryGetPublishedSite(slug: string): PublishedSite | null {
  try {
    return getPublishedSite(slug)
  } catch {
    return null
  }
}

export { PUBLISHED_ROOT, SLUG_RE }
