'use client'

import { useRouter } from '@/i18n/navigation'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useWorkspace } from '@/lib/workspace'
import { useApiFetch } from '@/lib/api'
import { Button, Card, Badge, Spinner, EmptyState, ErrorBanner } from '@/components/ui'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Trend {
  id: string
  workspaceId: string
  title: string
  description: string | null
  url: string | null
  source: string
  status: string
  relevanceScore: number | null
  category: string | null
  lifecycle: 'RISING' | 'PEAK' | 'DECLINING' | 'FLAT' | null
  sourceMetadata: unknown
  discoveredAt: string | null
  createdAt: string
  updatedAt: string
}


type FeedbackSignal = 'INTERESTING' | 'NOT_RELEVANT'

// ── Helpers ────────────────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual',
  google_trends: 'Google',
  youtube: 'YouTube',
  reddit: 'Reddit',
  rss: 'RSS',
  competitor: 'Competitor',
}

const SOURCE_BADGE_COLORS: Record<string, 'default' | 'blue' | 'red' | 'orange' | 'purple' | 'green'> = {
  manual: 'default',
  google_trends: 'blue',
  youtube: 'red',
  reddit: 'orange',
  rss: 'purple',
  competitor: 'green',
}

const LIFECYCLE_LABEL_KEYS: Record<string, 'lifecycleRising' | 'lifecyclePeak' | 'lifecycleDeclining' | 'lifecycleFlat'> = {
  RISING: 'lifecycleRising',
  PEAK: 'lifecyclePeak',
  DECLINING: 'lifecycleDeclining',
  FLAT: 'lifecycleFlat',
}

const LIFECYCLE_BADGE_COLORS: Record<string, 'green' | 'yellow' | 'red' | 'default'> = {
  RISING: 'green',
  PEAK: 'yellow',
  DECLINING: 'red',
  FLAT: 'default',
}

// ── Score Chip ─────────────────────────────────────────────────────────────────

function ScoreChip({ score }: { score: number }) {
  const color: 'green' | 'yellow' | 'red' =
    score >= 70 ? 'green' : score >= 50 ? 'yellow' : 'red'
  return <Badge color={color}>{score}/100</Badge>
}

// ── Trend Row ──────────────────────────────────────────────────────────────────

function TrendRow({
  trend,
  onAnalyze,
  onArchive,
  onGenerateIdeas,
  onFeedback,
  onQuickReact,
  analyzing,
  archiving,
  quickReacting,
  feedbackSignal,
}: {
  trend: Trend
  onAnalyze: (id: string) => void
  onArchive: (id: string) => void
  onGenerateIdeas: (id: string) => void
  onFeedback: (id: string, signal: FeedbackSignal) => void
  onQuickReact: (id: string) => void
  analyzing: boolean
  archiving: boolean
  quickReacting: boolean
  feedbackSignal: FeedbackSignal | null
}) {
  const t = useTranslations('common')
  const tTrends = useTranslations('trends')

  return (
    <Card className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-gray-900 text-sm leading-snug">
            {trend.title}
          </span>
          <Badge color={SOURCE_BADGE_COLORS[trend.source] ?? 'default'}>
            {SOURCE_LABELS[trend.source] ?? trend.source}
          </Badge>
          {trend.relevanceScore !== null && (
            <ScoreChip score={trend.relevanceScore} />
          )}
          {trend.lifecycle && (
            <Badge color={LIFECYCLE_BADGE_COLORS[trend.lifecycle] ?? 'default'}>
              {LIFECYCLE_LABEL_KEYS[trend.lifecycle] ? tTrends(LIFECYCLE_LABEL_KEYS[trend.lifecycle]) : trend.lifecycle}
            </Badge>
          )}
        </div>
        {trend.category && (
          <span className="text-xs text-gray-400">{trend.category}</span>
        )}
        {trend.url && (
          <a
            href={trend.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-indigo-600 hover:underline truncate block max-w-xs"
            title={trend.url}
          >
            {trend.url}
          </a>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
        {/* Feedback buttons */}
        <button
          onClick={() => onFeedback(trend.id, 'INTERESTING')}
          disabled={analyzing || archiving}
          title="Interesting"
          className={`px-2 py-1.5 text-sm rounded-lg border transition-colors disabled:opacity-50 ${
            feedbackSignal === 'INTERESTING'
              ? 'bg-green-50 border-green-400 text-green-700'
              : 'bg-white border-gray-200 text-gray-500 hover:bg-green-50'
          }`}
        >
          +1
        </button>
        <button
          onClick={() => onFeedback(trend.id, 'NOT_RELEVANT')}
          disabled={analyzing || archiving}
          title="Not relevant"
          className={`px-2 py-1.5 text-sm rounded-lg border transition-colors disabled:opacity-50 ${
            feedbackSignal === 'NOT_RELEVANT'
              ? 'bg-red-50 border-red-400 text-red-600'
              : 'bg-white border-gray-200 text-gray-500 hover:bg-red-50'
          }`}
        >
          -1
        </button>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => onQuickReact(trend.id)}
          disabled={analyzing || archiving || quickReacting}
          loading={quickReacting}
          title="Quick React: generate script and schedule in 15 min"
          className="bg-orange-500 text-white border-orange-500 hover:bg-orange-600 hover:border-orange-600"
        >
          ⚡ React
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => onAnalyze(trend.id)}
          disabled={analyzing || archiving || quickReacting}
          loading={analyzing}
        >
          {t('analyze')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onGenerateIdeas(trend.id)}
          disabled={analyzing || archiving}
        >
          {t('generateIdeas')}
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={() => onArchive(trend.id)}
          disabled={analyzing || archiving}
          loading={archiving}
        >
          {t('archive')}
        </Button>
      </div>
    </Card>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function TrendsPage() {
  const apiFetch = useApiFetch()
  const router = useRouter()
  const t = useTranslations('trends')
  const tCommon = useTranslations('common')

  const { activeId: workspaceId, status } = useWorkspace()
  const workspaceError = status === 'no-workspaces' ? 'no-workspaces' : status === 'fetch-failed' ? 'fetch-failed' : null
  const [trends, setTrends] = useState<Trend[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [analyzingId, setAnalyzingId] = useState<string | null>(null)
  const [archivingId, setArchivingId] = useState<string | null>(null)
  // Map of trendId -> active feedback signal
  const [feedbackMap, setFeedbackMap] = useState<Record<string, FeedbackSignal>>({})
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null)
  const [quickReactingId, setQuickReactingId] = useState<string | null>(null)
  const [quickReactMessage, setQuickReactMessage] = useState<string | null>(null)

  const STATUS_FILTERS = [
    { label: t('filterAll'), value: 'ALL' },
    { label: t('filterPending'), value: 'PENDING' },
    { label: t('filterAnalyzed'), value: 'ANALYZED' },
    { label: t('filterArchived'), value: 'ARCHIVED' },
  ]

  // Load trends when workspace or filter changes
  useEffect(() => {
    if (!workspaceId) return
    setLoading(true)
    setError(null)
    const params = new URLSearchParams()
    if (statusFilter !== 'ALL') params.set('status', statusFilter)
    const query = params.toString() ? `?${params.toString()}` : ''
    apiFetch(`/workspaces/${workspaceId}/trends${query}`)
      .then((r) => {
        if (r.status === 403) throw new Error('forbidden')
        if (!r.ok) throw new Error('fetch-failed')
        return r.json() as Promise<Trend[]>
      })
      .then((data) => setTrends(data))
      .catch((err: Error) => {
        if (err.message === 'forbidden') {
          setError(t('permissionError'))
        } else {
          setError(t('loadError'))
        }
      })
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, statusFilter])

  async function handleAnalyze(trendId: string) {
    if (!workspaceId) return
    setError(null)
    setAnalyzingId(trendId)
    try {
      const r = await apiFetch(
        `/workspaces/${workspaceId}/trends/${trendId}/analyze`,
        { method: 'POST' },
      )
      if (!r.ok) throw new Error('Failed to analyze')
      const updated = (await r.json()) as Trend
      setTrends((prev) => prev.map((t) => (t.id === trendId ? updated : t)))
    } catch {
      setError(t('analyzeError'))
    } finally {
      setAnalyzingId(null)
    }
  }

  async function handleArchive(trendId: string) {
    if (!workspaceId) return
    setError(null)
    setArchivingId(trendId)
    try {
      const r = await apiFetch(
        `/workspaces/${workspaceId}/trends/${trendId}/archive`,
        { method: 'POST' },
      )
      if (!r.ok) throw new Error('Failed to archive')
      setTrends((prev) => prev.filter((t) => t.id !== trendId))
    } catch {
      setError(t('archiveError'))
    } finally {
      setArchivingId(null)
    }
  }

  async function handleFeedback(trendId: string, signal: FeedbackSignal) {
    if (!workspaceId) return
    // Toggle: if same signal clicked again, still upsert (idempotent)
    const previous = feedbackMap[trendId] ?? null
    // Optimistic update
    setFeedbackMap((prev) => ({ ...prev, [trendId]: signal }))
    try {
      const r = await apiFetch(
        `/workspaces/${workspaceId}/trends/${trendId}/feedback`,
        { method: 'POST', body: JSON.stringify({ signal }) },
      )
      if (!r.ok) {
        // Revert on failure
        setFeedbackMap((prev) => {
          const next = { ...prev }
          if (previous === null) {
            delete next[trendId]
          } else {
            next[trendId] = previous
          }
          return next
        })
      }
    } catch {
      setFeedbackMap((prev) => {
        const next = { ...prev }
        if (previous === null) {
          delete next[trendId]
        } else {
          next[trendId] = previous
        }
        return next
      })
    }
  }

  function handleGenerateIdeas(trendId: string) {
    router.push(`/create?trendId=${trendId}`)
  }

  async function handleRefresh() {
    if (!workspaceId) return
    setRefreshing(true)
    setRefreshMessage(null)
    try {
      const r = await apiFetch(
        `/workspaces/${workspaceId}/trends/fetch`,
        { method: 'POST' },
      )
      if (!r.ok) throw new Error('failed')
      setRefreshMessage(t('refreshQueued'))
    } catch {
      setRefreshMessage(t('refreshFailed'))
    } finally {
      setRefreshing(false)
    }
  }

  async function handleQuickReact(trendId: string) {
    if (!workspaceId) return
    setQuickReactingId(trendId)
    setQuickReactMessage(null)
    try {
      const r = await apiFetch(`/workspaces/${workspaceId}/trends/${trendId}/quick/react`, { method: 'POST' })
      if (!r.ok) throw new Error('failed')
      setQuickReactMessage(t('quickReactSuccess'))
    } catch {
      setQuickReactMessage(t('quickReactError'))
    } finally {
      setQuickReactingId(null)
    }
  }

  if (workspaceError === 'no-workspaces') {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-600">{tCommon('noWorkspaces')}</p>
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
      {/* Page header */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <h1 className="text-2xl font-semibold text-gray-900">{t('title')}</h1>
        <Button
          variant="primary"
          onClick={handleRefresh}
          disabled={refreshing || !workspaceId}
          loading={refreshing}
        >
          {refreshing ? t('refreshing') : t('refreshTrends')}
        </Button>
      </div>

      {refreshMessage && (
        <div className="border border-gray-200 bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-700 mb-4">
          {refreshMessage}
        </div>
      )}

      {quickReactMessage && (
        <div className="border border-orange-200 bg-orange-50 rounded-xl px-4 py-3 text-sm text-orange-700 mb-4">
          {quickReactMessage}
        </div>
      )}

      {/* Status filter */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`px-4 py-1.5 text-sm rounded-lg border transition-colors font-medium ${
              statusFilter === f.value
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center gap-3 text-sm text-gray-600 py-8">
          <Spinner />
          <span>{tCommon('loading')}</span>
        </div>
      )}

      {error && (
        <ErrorBanner message={error} />
      )}

      {!loading && !error && trends.length === 0 && (
        <EmptyState
          title={t('noTrends')}
          description={t('noTrendsHint')}
          icon="📡"
        />
      )}

      {!loading && trends.length > 0 && (
        <div className="flex flex-col gap-3 max-w-3xl">
          {trends.map((trend) => (
            <TrendRow
              key={trend.id}
              trend={trend}
              onAnalyze={handleAnalyze}
              onArchive={handleArchive}
              onGenerateIdeas={handleGenerateIdeas}
              onFeedback={handleFeedback}
              onQuickReact={handleQuickReact}
              analyzing={analyzingId === trend.id}
              archiving={archivingId === trend.id}
              quickReacting={quickReactingId === trend.id}
              feedbackSignal={feedbackMap[trend.id] ?? null}
            />
          ))}
        </div>
      )}
    </div>
  )
}
