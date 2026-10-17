const SLUG_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$/

const RESERVED = new Set([
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
])

export function isValidSlug(value: string): boolean {
  const slug = value.trim()
  return SLUG_RE.test(slug) && !RESERVED.has(slug.toLowerCase())
}

export function slugError(value: string): string | null {
  const slug = value.trim()
  if (!slug) return 'Enter a site name'
  if (!SLUG_RE.test(slug)) {
    return 'Use letters, numbers, hyphens, and underscores only (max 48 chars)'
  }
  if (RESERVED.has(slug.toLowerCase())) {
    return `"${slug}" is reserved`
  }
  return null
}

/** Path segment for a published site, or null for the editor. */
export function publishedSlugFromPath(pathname: string): string | null {
  const raw = pathname.replace(/^\/+|\/+$/g, '')
  if (!raw || raw.includes('/')) return null
  if (!isValidSlug(raw)) return null
  return raw
}
