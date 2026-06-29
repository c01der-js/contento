'use client'

import { useEffect, useState } from 'react'
import { useWorkspace } from '@/lib/workspace'
import { useApiFetch } from '@/lib/api'
import { Button, Card, Spinner, EmptyState } from '@/components/ui'
import { useTranslations } from 'next-intl'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Summary {
  trends: number
  ideas: number
  scripts: number
  publications: number
}

interface PlatformCount {
  platform: string
  count: number
}

interface MetricSet {
  reach: number
  impressions: number
  likes: number
  er: number
}

interface MetricsResponse {
  current: MetricSet
  previous?: MetricSet
  delta?: MetricSet
}

interface FollowerSnapshot {
  date: string
  followerCount: number
  platform: string
}

interface PillarStat {
  pillarId: string
  pillarName: string
  publicationCount: number
}

interface Recommendation {
  recommendations: string[]
}


type Period = '7d' | '30d' | '90d'

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="flex flex-col gap-1">
      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">{label}</p>
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
    </Card>
  )
}

function DeltaBadge({ value }: { value: number }) {
  const sign = value > 0 ? '+' : ''
  const color = value > 0 ? 'text-green-600' : value < 0 ? 'text-red-600' : 'text-gray-400'
  return <span className={`text-xs font-medium ${color}`}>{sign}{value.toFixed(1)}</span>
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const apiFetch = useApiFetch()
  const t = useTranslations('analytics')

  const { activeId: workspaceId } = useWorkspace()
  const [period, setPeriod] = useState<Period>('30d')

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">{t('title')}</h1>

        <div className="flex gap-1 border border-gray-200 rounded-lg p-1 bg-gray-50">
          {(['7d', '30d', '90d'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                period === p
                  ? 'bg-white shadow-sm text-gray-900 border border-gray-200'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {workspaceId ? (
        <>
          <SummarySection workspaceId={workspaceId} apiFetch={apiFetch} />
          <MetricsSection workspaceId={workspaceId} period={period} apiFetch={apiFetch} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PublicationsSection workspaceId={workspaceId} period={period} apiFetch={apiFetch} />
            <FollowersSection workspaceId={workspaceId} range={period} apiFetch={apiFetch} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PillarSection workspaceId={workspaceId} apiFetch={apiFetch} />
            <RecommendationsSection workspaceId={workspaceId} apiFetch={apiFetch} />
          </div>
          <ExportSection workspaceId={workspaceId} apiFetch={apiFetch} />
        </>
      ) : (
        <EmptyState
          title={t('noWorkspace')}
          description={t('noWorkspaceDesc')}
          icon="📊"
        />
      )}
    </div>
  )
}

// ── Sections ──────────────────────────────────────────────────────────────────

type ApiFetch = (path: string) => Promise<Response>

function SummarySection({ workspaceId, apiFetch }: { workspaceId: string; apiFetch: ApiFetch }) {
  const t = useTranslations('analytics')
  const [data, setData] = useState<Summary | null>(null)

  useEffect(() => {
    apiFetch(`/workspaces/${workspaceId}/analytics/summary`)
      .then((r) => r.json())
      .then((d: Summary) => setData(d))
      .catch(() => {/* silent */})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  if (!data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="h-16 animate-pulse bg-gray-50" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard label={t('statTrends')} value={data.trends} />
      <StatCard label={t('statIdeas')} value={data.ideas} />
      <StatCard label={t('statScripts')} value={data.scripts} />
      <StatCard label={t('statPublications')} value={data.publications} />
    </div>
  )
}

function MetricsSection({ workspaceId, period, apiFetch }: { workspaceId: string; period: Period; apiFetch: ApiFetch }) {
  const t = useTranslations('analytics')
  const [data, setData] = useState<MetricsResponse | null>(null)

  useEffect(() => {
    apiFetch(`/workspaces/${workspaceId}/analytics/metrics?period=${period}&prevPeriod=true`)
      .then((r) => r.json())
      .then((d: MetricsResponse) => setData(d))
      .catch(() => {/* silent */})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, period])

  if (!data) return null

  const { current, delta } = data

  const METRIC_LABELS: Record<'reach' | 'impressions' | 'likes' | 'er', string> = {
    reach: t('reach'),
    impressions: t('impressions'),
    likes: t('likes'),
    er: t('engagementRate'),
  }

  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">{t('engagementMetrics')}</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(['reach', 'impressions', 'likes', 'er'] as const).map((key) => (
          <Card key={key} className="flex flex-col gap-1">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
              {METRIC_LABELS[key]}
            </p>
            <p className="text-xl font-semibold text-gray-900">
              {key === 'er' ? `${(current[key] * 100).toFixed(1)}%` : current[key].toLocaleString()}
            </p>
            {delta && <DeltaBadge value={delta[key]} />}
          </Card>
        ))}
      </div>
    </div>
  )
}

function PublicationsSection({ workspaceId, period, apiFetch }: { workspaceId: string; period: Period; apiFetch: ApiFetch }) {
  const t = useTranslations('analytics')
  const [data, setData] = useState<PlatformCount[]>([])

  useEffect(() => {
    apiFetch(`/workspaces/${workspaceId}/analytics/publications?period=${period}`)
      .then((r) => r.json())
      .then((d: PlatformCount[]) => setData(Array.isArray(d) ? d : []))
      .catch(() => {/* silent */})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, period])

  const max = Math.max(...data.map((d) => d.count), 1)

  return (
    <Card>
      <h2 className="text-sm font-semibold text-gray-800 mb-4">{t('publicationsByPlatform')}</h2>
      {data.length === 0 ? (
        <p className="text-sm text-gray-400">{t('noPlatformData')}</p>
      ) : (
        <div className="space-y-3">
          {data.map((row) => (
            <div key={row.platform}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-700 capitalize">{row.platform}</span>
                <span className="text-gray-500 font-medium">{row.count}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div
                  className="bg-indigo-500 h-1.5 rounded-full"
                  style={{ width: `${(row.count / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function FollowersSection({ workspaceId, range, apiFetch }: { workspaceId: string; range: Period; apiFetch: ApiFetch }) {
  const t = useTranslations('analytics')
  const [snapshots, setSnapshots] = useState<FollowerSnapshot[]>([])

  useEffect(() => {
    apiFetch(`/workspaces/${workspaceId}/analytics/followers?range=${range}`)
      .then((r) => r.json())
      .then((d: { snapshots: FollowerSnapshot[] }) => setSnapshots(Array.isArray(d?.snapshots) ? d.snapshots : []))
      .catch(() => {/* silent */})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, range])

  const byPlatform = snapshots.reduce<Record<string, FollowerSnapshot[]>>((acc, s) => {
    const arr = acc[s.platform] ?? []
    arr.push(s)
    acc[s.platform] = arr
    return acc
  }, {})

  return (
    <Card>
      <h2 className="text-sm font-semibold text-gray-800 mb-4">{t('followerGrowth')}</h2>
      {Object.keys(byPlatform).length === 0 ? (
        <p className="text-sm text-gray-400">{t('noFollowerData')}</p>
      ) : (
        <div className="space-y-3">
          {Object.entries(byPlatform).map(([platform, snaps]) => {
            const first = snaps[0]?.followerCount ?? 0
            const last = snaps[snaps.length - 1]?.followerCount ?? 0
            const delta = last - first
            return (
              <div key={platform} className="flex items-center justify-between">
                <span className="capitalize text-sm text-gray-700">{platform}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">{last.toLocaleString()}</span>
                  <DeltaBadge value={delta} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

function PillarSection({ workspaceId, apiFetch }: { workspaceId: string; apiFetch: ApiFetch }) {
  const t = useTranslations('analytics')
  const [data, setData] = useState<PillarStat[]>([])

  useEffect(() => {
    apiFetch(`/workspaces/${workspaceId}/analytics/by-pillar`)
      .then((r) => r.json())
      .then((d: PillarStat[]) => setData(Array.isArray(d) ? d : []))
      .catch(() => {/* silent */})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  return (
    <Card>
      <h2 className="text-sm font-semibold text-gray-800 mb-4">{t('publicationsByPillar')}</h2>
      {data.length === 0 ? (
        <p className="text-sm text-gray-400">{t('noPillarData')}</p>
      ) : (
        <div className="space-y-2">
          {data.map((row) => (
            <div key={row.pillarId} className="flex justify-between items-center text-sm py-0.5">
              <span className="text-gray-700">{row.pillarName}</span>
              <span className="font-semibold text-gray-900">{row.publicationCount}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function RecommendationsSection({ workspaceId, apiFetch }: { workspaceId: string; apiFetch: ApiFetch }) {
  const t = useTranslations('analytics')
  const [recs, setRecs] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  function load() {
    setLoading(true)
    apiFetch(`/workspaces/${workspaceId}/analytics/recommendations`)
      .then((r) => r.json())
      .then((d: Recommendation) => setRecs(Array.isArray(d?.recommendations) ? d.recommendations : []))
      .catch(() => {/* silent */})
      .finally(() => setLoading(false))
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-800">{t('aiRecommendations')}</h2>
        <Button
          variant="primary"
          size="sm"
          onClick={load}
          disabled={loading}
          loading={loading}
        >
          {loading ? t('generatingRecs') : t('generate')}
        </Button>
      </div>
      {recs.length === 0 ? (
        <p className="text-sm text-gray-400">{t('noRecommendations')}</p>
      ) : (
        <ul className="space-y-2">
          {recs.map((rec, i) => (
            <li key={i} className="flex gap-2 text-sm text-gray-700">
              <span className="text-indigo-500 font-semibold shrink-0">{i + 1}.</span>
              <span>{rec}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function ExportSection({ workspaceId, apiFetch }: { workspaceId: string; apiFetch: ApiFetch }) {
  const t = useTranslations('analytics')

  async function handleExport(format: 'csv' | 'json') {
    const r = await apiFetch(`/workspaces/${workspaceId}/analytics/export?format=${format}`)
    const blob = await r.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `analytics.${format}`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-600 font-medium">{t('export')}:</span>
      <Button variant="secondary" size="sm" onClick={() => handleExport('csv')}>
        CSV
      </Button>
      <Button variant="secondary" size="sm" onClick={() => handleExport('json')}>
        JSON
      </Button>
    </div>
  )
}
