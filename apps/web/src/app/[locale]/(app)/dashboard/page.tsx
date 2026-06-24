'use client'

import { useCallback, useEffect, useState } from 'react'
import { useWorkspace } from '@/lib/workspace'
import { useApiFetch } from '@/lib/api'
import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { FunnelStats } from './_components/FunnelStats'
import { PublicationChart } from './_components/PublicationChart'
import { AttributionTable } from './_components/AttributionTable'
import { LlmUsagePanel } from './_components/LlmUsagePanel'
import { MentionAlerts } from './_components/MentionAlerts'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Actor {
  id: string
  name: string | null
  email: string
  avatarUrl: string | null
}

interface ActivityItem {
  id: string
  workspaceId: string
  actorId: string | null
  actor: Actor | null
  action: 'CREATE' | 'UPDATE' | 'DELETE'
  entityType: string
  entityId: string
  meta: unknown
  createdAt: string
}

interface SummaryStats {
  trends: number
  ideas: number
  scripts: number
  publications: number
}

interface PlatformCount {
  platform: string
  count: number
}

interface AttributionRow {
  platform: string
  format: string
  count: number
}

interface LlmRow {
  agent: string
  model: string
  calls: number
  totalCostUsd: number
}

interface Mention {
  id: string
  source: string
  text: string
  sentiment: string
  urgency: number
  url: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'created',
  UPDATE: 'updated',
  DELETE: 'deleted',
}

function formatActivityLine(item: ActivityItem): string {
  const actor = item.actor?.name ?? item.actor?.email ?? 'Someone'
  const action = ACTION_LABELS[item.action] ?? item.action.toLowerCase()
  const entity = item.entityType.toLowerCase().replace(/_/g, ' ')
  return `${actor} ${action} ${entity}`
}

type ApiFetch = (path: string, options?: RequestInit) => Promise<Response>

// ── Quick Actions ─────────────────────────────────────────────────────────────

function QuickActions() {
  const t = useTranslations('dashboard')

  const actions = [
    { labelKey: 'actionTrends' as const, href: '/trends' },
    { labelKey: 'actionCreate' as const, href: '/create' },
    { labelKey: 'actionLibrary' as const, href: '/library' },
  ]

  return (
    <div className="flex flex-wrap gap-3">
      {actions.map(({ labelKey, href }) => (
        <Link
          key={href}
          href={href}
          className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          {t(labelKey)}
        </Link>
      ))}
    </div>
  )
}

// ── Activity Feed Card ────────────────────────────────────────────────────────

function ActivityFeed({
  workspaceId,
  apiFetch,
}: {
  workspaceId: string
  apiFetch: ApiFetch
}) {
  const t = useTranslations('dashboard')
  const [items, setItems] = useState<ActivityItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    apiFetch(`/workspaces/${workspaceId}/activity?limit=20`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<{ items: ActivityItem[]; nextCursor: string | null }>
      })
      .then((data) => {
        if (!cancelled) setItems(data.items)
      })
      .catch(() => {
        if (!cancelled) setError(t('activityError'))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  return (
    <section className="border rounded-lg p-4 bg-white shadow-sm">
      <h2 className="text-sm font-semibold mb-4 text-gray-800">{t('activityTitle')}</h2>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      {isLoading ? (
        <p className="text-gray-400 text-sm">{t('activityLoading')}</p>
      ) : items.length === 0 ? (
        <p className="text-gray-400 text-sm">{t('activityEmpty')}</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-3 py-3">
              <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600 shrink-0 mt-0.5">
                {(item.actor?.name ?? item.actor?.email ?? '?')[0]?.toUpperCase() ?? '?'}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800">{formatActivityLine(item)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{timeAgo(item.createdAt)}</p>
              </div>

              <span
                className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${
                  item.action === 'CREATE'
                    ? 'bg-green-50 text-green-700'
                    : item.action === 'DELETE'
                    ? 'bg-red-50 text-red-700'
                    : 'bg-yellow-50 text-yellow-700'
                }`}
              >
                {item.action}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ── Analytics Bundle (Funnel + Charts + LLM + Mentions) ───────────────────────

function AnalyticsWidgets({
  workspaceId,
  apiFetch,
}: {
  workspaceId: string
  apiFetch: ApiFetch
}) {
  const t = useTranslations('dashboard')

  const [summary, setSummary] = useState<SummaryStats | null>(null)
  const [publications, setPublications] = useState<PlatformCount[]>([])
  const [attribution, setAttribution] = useState<AttributionRow[]>([])
  const [llmUsage, setLlmUsage] = useState<LlmRow[]>([])
  const [mentions, setMentions] = useState<Mention[]>([])
  const [loading, setLoading] = useState(true)
  const [errorWidget, setErrorWidget] = useState<string | null>(null)

  const loadJson = useCallback(
    async <T,>(path: string, fallback: T): Promise<T> => {
      try {
        const r = await apiFetch(path)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return (await r.json()) as T
      } catch {
        return fallback
      }
    },
    [apiFetch],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setErrorWidget(null)

    Promise.all([
      loadJson<SummaryStats | null>(`/workspaces/${workspaceId}/analytics/summary`, null),
      loadJson<PlatformCount[]>(`/workspaces/${workspaceId}/analytics/publications?period=30d`, []),
      loadJson<AttributionRow[]>(`/workspaces/${workspaceId}/analytics/attribution`, []),
      loadJson<LlmRow[]>(`/workspaces/${workspaceId}/analytics/llm-usage?period=30d`, []),
      loadJson<Mention[]>(`/workspaces/${workspaceId}/mentions?urgencyMin=7&limit=10`, []),
    ])
      .then(([sum, pubs, attr, llm, ment]) => {
        if (cancelled) return
        setSummary(sum)
        setPublications(pubs)
        setAttribution(attr)
        setLlmUsage(llm)
        setMentions(ment)
      })
      .catch(() => {
        if (!cancelled) setErrorWidget(t('widgetError'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [workspaceId, loadJson, t])

  return (
    <div className="space-y-6">
      <FunnelStats data={summary} loading={loading} />

      {errorWidget && <p className="text-sm text-red-500">{errorWidget}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PublicationChart data={publications} />
        <AttributionTable data={attribution} />
      </div>

      <LlmUsagePanel data={llmUsage} />

      <MentionAlerts data={mentions} />
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const t = useTranslations('dashboard')

  const { activeId: workspaceId } = useWorkspace()

  const apiFetch = useApiFetch()

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>

      {workspaceId ? (
        <>
          <QuickActions />
          <AnalyticsWidgets workspaceId={workspaceId} apiFetch={apiFetch} />
          <ActivityFeed workspaceId={workspaceId} apiFetch={apiFetch} />
        </>
      ) : (
        <div className="border rounded-lg p-8 text-center text-gray-400 max-w-md">
          <p className="text-sm">{t('noWorkspace')}</p>
        </div>
      )}
    </div>
  )
}
