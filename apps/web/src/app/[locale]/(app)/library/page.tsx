'use client'

import { useApiFetch } from '@/lib/api'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useSearchParams, useRouter } from 'next/navigation'
import { useWorkspace } from '@/lib/workspace'
import { Link } from '@/i18n/navigation'
import { Button, Card, Badge, Spinner, Input, EmptyState, ErrorBanner } from '@/components/ui'

// ── Types ──────────────────────────────────────────────────────────────────────

interface PublishedItem {
  id: string
  scriptId: string
  platform: string
  accountName: string
  hook: string
  body: string
  publishedAt: string | null
  reach: number | null
  er: number | null
}

interface SimilarScript {
  id: string
  hook: string
  body: string
  similarity: number
}


// ── Helpers ────────────────────────────────────────────────────────────────────

const PLATFORMS = ['All', 'instagram', 'tiktok', 'youtube', 'telegram']

const PLATFORM_BADGE_COLOR: Record<string, 'indigo' | 'red' | 'blue' | 'default'> = {
  instagram: 'indigo',
  tiktok: 'default',
  youtube: 'red',
  telegram: 'blue',
}

function MetricBadge({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
      {label}: {value}
    </span>
  )
}

// ── Publication Card ───────────────────────────────────────────────────────────

function PublicationCard({
  item,
  onFindSimilar,
  isSimilarActive,
}: {
  item: PublishedItem
  onFindSimilar: (scriptId: string) => void
  isSimilarActive: boolean
}) {
  const t = useTranslations('library')
  const hookExcerpt = item.hook.length > 120 ? item.hook.slice(0, 120) + '…' : item.hook
  const pubDate = item.publishedAt
    ? new Date(item.publishedAt).toLocaleDateString()
    : '—'

  const badgeColor = PLATFORM_BADGE_COLOR[item.platform] ?? 'default'

  return (
    <Card className={`flex flex-col gap-3 ${isSimilarActive ? 'ring-2 ring-indigo-400' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <Badge color={badgeColor}>{item.platform}</Badge>
        <span className="text-xs text-gray-400">{pubDate}</span>
      </div>
      <p className="text-sm font-medium text-gray-900 leading-snug">{hookExcerpt}</p>
      <div className="flex items-center gap-2 flex-wrap">
        {item.reach !== null && <MetricBadge label={t('reach')} value={item.reach.toLocaleString()} />}
        {item.er !== null && <MetricBadge label={t('er')} value={`${item.er.toFixed(1)}%`} />}
      </div>
      <Button
        variant={isSimilarActive ? 'primary' : 'secondary'}
        size="sm"
        onClick={() => onFindSimilar(item.scriptId)}
        className="self-start"
      >
        {t('findSimilar')}
      </Button>
    </Card>
  )
}

// ── Similar Panel ──────────────────────────────────────────────────────────────

function SimilarPanel({
  items,
  loading,
  onClose,
}: {
  items: SimilarScript[]
  loading: boolean
  onClose: () => void
}) {
  const t = useTranslations('library')
  const tCommon = useTranslations('common')

  return (
    <Card className="flex flex-col gap-3 bg-indigo-50 border-indigo-200">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-indigo-800">{t('similarResults')}</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          ✕
        </Button>
      </div>
      {loading && (
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <Spinner />
          <span>{tCommon('loading')}</span>
        </div>
      )}
      {!loading && items.length === 0 && (
        <p className="text-sm text-gray-500">{t('noResults')}</p>
      )}
      {!loading && items.map((s) => (
        <Card key={s.id} className="flex flex-col gap-1 p-3">
          <p className="text-xs font-medium text-gray-700">{s.hook.length > 100 ? s.hook.slice(0, 100) + '…' : s.hook}</p>
          <span className="text-xs text-gray-400">
            {Math.round(s.similarity * 100)}% match
          </span>
        </Card>
      ))}
    </Card>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function LibraryPage() {
  const apiFetch = useApiFetch()
  const t = useTranslations('library')
  const tCommon = useTranslations('common')
  const searchParams = useSearchParams()
  const router = useRouter()

  const { activeId, status } = useWorkspace()
  const workspaceId = searchParams.get('workspaceId') ?? activeId
  const workspaceError = status === 'no-workspaces' ? 'no-workspaces' : status === 'fetch-failed' ? 'fetch-failed' : null
  const [publications, setPublications] = useState<PublishedItem[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [debouncedQuery, setDebouncedQuery] = useState(query)
  const [platform, setPlatform] = useState('All')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [minER, setMinER] = useState('')

  // Similar
  const similarScriptId = searchParams.get('similar') ?? null
  const [similarItems, setSimilarItems] = useState<SimilarScript[]>([])
  const [similarLoading, setSimilarLoading] = useState(false)
  const [activeSimilarId, setActiveSimilarId] = useState<string | null>(similarScriptId)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce search query
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  const buildParams = useCallback(
    (cursor?: string) => {
      const params = new URLSearchParams()
      if (debouncedQuery) params.set('q', debouncedQuery)
      if (platform !== 'All') params.set('platform', platform)
      if (from) params.set('from', new Date(from).toISOString())
      if (to) params.set('to', new Date(to).toISOString())
      if (minER) params.set('minER', minER)
      if (cursor) params.set('cursor', cursor)
      params.set('limit', '20')
      return params.toString()
    },
    [debouncedQuery, platform, from, to, minER],
  )

  // Load publications
  useEffect(() => {
    if (!workspaceId) return
    setLoading(true)
    setError(null)
    setPublications([])
    setNextCursor(null)
    apiFetch(`/workspaces/${workspaceId}/library/published?${buildParams()}`)
      .then((r) => {
        if (!r.ok) throw new Error('fetch-failed')
        return r.json() as Promise<{ publications: PublishedItem[]; nextCursor: string | null }>
      })
      .then((data) => {
        setPublications(data.publications)
        setNextCursor(data.nextCursor)
      })
      .catch(() => setError(t('loadError')))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, debouncedQuery, platform, from, to, minER])

  async function loadMore() {
    if (!workspaceId || !nextCursor) return
    setLoadingMore(true)
    try {
      const r = await apiFetch(
        `/workspaces/${workspaceId}/library/published?${buildParams(nextCursor)}`,
      )
      if (!r.ok) throw new Error('fetch-failed')
      const data = (await r.json()) as { publications: PublishedItem[]; nextCursor: string | null }
      setPublications((prev) => [...prev, ...data.publications])
      setNextCursor(data.nextCursor)
    } catch {
      setError(t('loadMoreError'))
    } finally {
      setLoadingMore(false)
    }
  }

  // Load similar when activeSimilarId changes
  useEffect(() => {
    if (!workspaceId || !activeSimilarId) return
    setSimilarLoading(true)
    setSimilarItems([])
    apiFetch(`/workspaces/${workspaceId}/scripts/${activeSimilarId}/similar`)
      .then((r) => r.json() as Promise<SimilarScript[]>)
      .then((data) => setSimilarItems(Array.isArray(data) ? data : []))
      .catch(() => setSimilarItems([]))
      .finally(() => setSimilarLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, activeSimilarId])

  function handleFindSimilar(scriptId: string) {
    if (activeSimilarId === scriptId) {
      setActiveSimilarId(null)
      router.replace('/library')
    } else {
      setActiveSimilarId(scriptId)
      router.replace(`/library?similar=${scriptId}`)
    }
  }

  if (workspaceError === 'no-workspaces') {
    return (
      <div className="p-6">
        <EmptyState title={tCommon('noWorkspaces')} icon="🏢" />
      </div>
    )
  }
  if (workspaceError === 'fetch-failed') {
    return (
      <div className="p-6">
        <ErrorBanner message={tCommon('failedWorkspace')} />
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">{t('title')}</h1>
        <div className="flex items-center gap-2">
          <Link href="/library/drafts">
            <Button variant="secondary" size="sm">{t('drafts')}</Button>
          </Link>
          <Link href="/library/assets">
            <Button variant="secondary" size="sm">{t('assets')}</Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 mb-6 max-w-4xl">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('search')}
        />
        <div className="flex items-center gap-2 flex-wrap">
          {PLATFORMS.map((p) => (
            <Button
              key={p}
              variant={platform === p ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setPlatform(p)}
            >
              {p === 'All' ? t('all') : p}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-1 text-xs text-gray-600">
            {t('from')}
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-indigo-400"
            />
          </label>
          <label className="flex items-center gap-1 text-xs text-gray-600">
            {t('to')}
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-indigo-400"
            />
          </label>
          <label className="flex items-center gap-1 text-xs text-gray-600">
            {t('minER')}
            <input
              type="number"
              min="0"
              step="0.1"
              value={minER}
              onChange={(e) => setMinER(e.target.value)}
              placeholder="0.0"
              className="border border-gray-300 rounded-lg px-2 py-1 text-xs w-20 focus:outline-none focus:border-indigo-400"
            />
          </label>
        </div>
      </div>

      {/* Similar panel */}
      {activeSimilarId && (
        <div className="mb-6 max-w-4xl">
          <SimilarPanel
            items={similarItems}
            loading={similarLoading}
            onClose={() => {
              setActiveSimilarId(null)
              router.replace('/library')
            }}
          />
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-3 text-gray-500 text-sm py-8">
          <Spinner />
          <span>{tCommon('loading')}</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 max-w-4xl">
          <ErrorBanner message={error} />
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && publications.length === 0 && (
        <div className="max-w-4xl">
          <EmptyState
            title={t('noResults')}
            description={t('filterHint')}
            icon="📭"
          />
        </div>
      )}

      {/* Grid */}
      {!loading && publications.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl">
          {publications.map((item) => (
            <PublicationCard
              key={item.id}
              item={item}
              onFindSimilar={handleFindSimilar}
              isSimilarActive={activeSimilarId === item.scriptId}
            />
          ))}
        </div>
      )}

      {/* Load more */}
      {nextCursor && !loading && (
        <div className="mt-6">
          <Button
            variant="secondary"
            onClick={loadMore}
            disabled={loadingMore}
            loading={loadingMore}
          >
            {t('loadMore')}
          </Button>
        </div>
      )}
    </div>
  )
}
