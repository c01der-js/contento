'use client'

import { useCallback, useEffect, useState } from 'react'
import { useWorkspace } from '@/lib/workspace'
import { useApiFetch } from '@/lib/api'
import { Button, Card, Select, Spinner, ErrorBanner } from '@/components/ui/index'
import { useTranslations } from 'next-intl'

type SourceName = 'rss' | 'reddit' | 'google_trends' | 'youtube'

interface FeedConfig {
  id: string
  source: SourceName | string
  config: unknown
  enabled: boolean
  createdAt: string
  updatedAt: string
}

const KNOWN_SOURCES: SourceName[] = ['rss', 'reddit', 'google_trends', 'youtube']

const SOURCE_LABEL: Record<string, string> = {
  rss: 'RSS feeds',
  reddit: 'Reddit',
  google_trends: 'Google Trends',
  youtube: 'YouTube',
}

export default function TrendSourcesPage() {
  const t = useTranslations('settings')
  const tCommon = useTranslations('common')
  const { activeId: workspaceId } = useWorkspace()
  const apiFetch = useApiFetch()

  const [configs, setConfigs] = useState<FeedConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [addSource, setAddSource] = useState<SourceName>('rss')
  const [addEnabled, setAddEnabled] = useState(true)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    setError('')
    try {
      const r = await apiFetch(`/workspaces/${workspaceId}/trend-feed-configs`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setConfigs((await r.json()) as FeedConfig[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [workspaceId, apiFetch])

  useEffect(() => {
    load()
  }, [load])

  async function handleAdd() {
    if (!workspaceId) return
    setAdding(true)
    setError('')
    try {
      const r = await apiFetch(`/workspaces/${workspaceId}/trend-feed-configs`, {
        method: 'POST',
        body: JSON.stringify({ source: addSource, enabled: addEnabled, config: {} }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add')
    } finally {
      setAdding(false)
    }
  }

  async function toggleEnabled(cfg: FeedConfig) {
    if (!workspaceId) return
    setError('')
    try {
      const r = await apiFetch(
        `/workspaces/${workspaceId}/trend-feed-configs/${cfg.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ enabled: !cfg.enabled }),
        },
      )
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update')
    }
  }

  async function remove(cfg: FeedConfig) {
    if (!workspaceId) return
    if (!confirm(t('removeSourceConfirm', { source: cfg.source }))) return
    setError('')
    try {
      const r = await apiFetch(
        `/workspaces/${workspaceId}/trend-feed-configs/${cfg.id}`,
        { method: 'DELETE' },
      )
      if (!r.ok && r.status !== 204) throw new Error(`HTTP ${r.status}`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  if (!workspaceId) {
    return (
      <div className="p-4 text-gray-500 text-sm">{t('selectWorkspaceFirst')}</div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="text-2xl font-semibold">{t('trendSourcesTitle')}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {t('trendSourcesDesc')}
        </p>
      </header>

      {error && <ErrorBanner message={error} />}

      <Card>
        <h2 className="text-sm font-semibold mb-3">{t('addSourceOverride')}</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-gray-500">{t('sourceLabel')}</label>
            <Select
              value={addSource}
              onChange={(e) => setAddSource(e.target.value as SourceName)}
            >
              {KNOWN_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {SOURCE_LABEL[s]}
                </option>
              ))}
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={addEnabled}
              onChange={(e) => setAddEnabled(e.target.checked)}
            />
            {t('enabledLabel')}
          </label>
          <Button onClick={handleAdd} loading={adding} disabled={adding}>
            {t('addButton')}
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold mb-3">{t('existingOverrides')}</h2>
        {loading ? (
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <Spinner />
            <span>{tCommon('loading')}</span>
          </div>
        ) : configs.length === 0 ? (
          <p className="text-sm text-gray-500">
            {t('noOverrides')}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2 font-medium">{t('tableSource')}</th>
                <th className="pb-2 font-medium">{t('tableStatus')}</th>
                <th className="pb-2 font-medium">{t('tableUpdated')}</th>
                <th className="pb-2 font-medium text-right">{t('tableActions')}</th>
              </tr>
            </thead>
            <tbody>
              {configs.map((cfg) => (
                <tr key={cfg.id} className="border-b last:border-b-0">
                  <td className="py-2">{SOURCE_LABEL[cfg.source] ?? cfg.source}</td>
                  <td className="py-2">
                    <span
                      className={
                        cfg.enabled
                          ? 'text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-xs font-medium'
                          : 'text-gray-600 bg-gray-100 px-2 py-0.5 rounded text-xs font-medium'
                      }
                    >
                      {cfg.enabled ? t('statusEnabled') : t('statusDisabled')}
                    </span>
                  </td>
                  <td className="py-2 text-gray-500 text-xs">
                    {new Date(cfg.updatedAt).toLocaleString()}
                  </td>
                  <td className="py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" onClick={() => toggleEnabled(cfg)}>
                        {cfg.enabled ? t('disable') : t('enable')}
                      </Button>
                      <Button variant="ghost" onClick={() => remove(cfg)}>
                        {t('delete')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
