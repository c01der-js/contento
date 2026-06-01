'use client'

import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useState } from 'react'
import { useWorkspace } from '@/lib/workspace'
import { Button, Card, Select, Spinner, ErrorBanner } from '@/components/ui/index'

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
  const { getToken } = useAuth()
  const { activeId: workspaceId } = useWorkspace()
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

  const [configs, setConfigs] = useState<FeedConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [addSource, setAddSource] = useState<SourceName>('rss')
  const [addEnabled, setAddEnabled] = useState(true)
  const [adding, setAdding] = useState(false)

  const apiFetch = useCallback(
    async (path: string, options?: RequestInit) => {
      const token = await getToken()
      return fetch(`${apiBase}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...options?.headers,
        },
      })
    },
    [apiBase, getToken],
  )

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
    if (!confirm(`Remove ${cfg.source} feed config?`)) return
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
      <div className="p-4 text-gray-500 text-sm">Select a workspace first.</div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="text-2xl font-semibold">Trend Sources</h1>
        <p className="text-sm text-gray-500 mt-1">
          Toggle which trend sources the scraper polls. Disabling a source stops
          new trends being ingested from it at the next scrape round.
          Configuration is global (shared across all workspaces) and only
          workspace owners can change it.
        </p>
      </header>

      {error && <ErrorBanner message={error} />}

      <Card>
        <h2 className="text-sm font-semibold mb-3">Add source override</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-gray-500">Source</label>
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
            Enabled
          </label>
          <Button onClick={handleAdd} loading={adding} disabled={adding}>
            Add
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold mb-3">Existing overrides</h2>
        {loading ? (
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <Spinner />
            <span>Loading…</span>
          </div>
        ) : configs.length === 0 ? (
          <p className="text-sm text-gray-500">
            No overrides — all known sources run by default.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2 font-medium">Source</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Updated</th>
                <th className="pb-2 font-medium text-right">Actions</th>
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
                      {cfg.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td className="py-2 text-gray-500 text-xs">
                    {new Date(cfg.updatedAt).toLocaleString()}
                  </td>
                  <td className="py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" onClick={() => toggleEnabled(cfg)}>
                        {cfg.enabled ? 'Disable' : 'Enable'}
                      </Button>
                      <Button variant="ghost" onClick={() => remove(cfg)}>
                        Delete
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
