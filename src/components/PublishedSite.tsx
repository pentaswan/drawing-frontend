import { useEffect, useState } from 'react'
import { fetchPublishedSite, type PublishedSiteData } from '../lib/api.ts'
import { PageRenderer } from './PageRenderer.tsx'

type Props = {
  slug: string
}

export function PublishedSite({ slug }: Props) {
  const [site, setSite] = useState<PublishedSiteData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchPublishedSite(slug)
      .then((data) => {
        if (cancelled) return
        setSite(data)
        document.title = data.title || data.slug
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Site not found')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  if (loading) {
    return (
      <div className="published-shell">
        <p className="published-shell__status">Loading…</p>
      </div>
    )
  }

  if (error || !site) {
    return (
      <div className="published-shell">
        <p className="published-shell__status published-shell__status--error">
          {error || 'Site not found'}
        </p>
        <p className="published-shell__hint">
          <a href="/">Back to editor</a>
        </p>
      </div>
    )
  }

  return (
    <div className="published-shell">
      <div className="site site--published">
        <PageRenderer
          elements={site.elements}
          pageCss={site.pageCss}
          apiBase={site.apiBase}
        />
      </div>
    </div>
  )
}
