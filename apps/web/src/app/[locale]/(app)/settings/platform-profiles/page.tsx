'use client'

import { useCallback, useEffect, useState } from 'react'
import { useWorkspace } from '@/lib/workspace'
import { useApiFetch } from '@/lib/api'
import { Button, Card, Input, Select, Spinner, ErrorBanner } from '@/components/ui/index'

interface Profile {
  platform: string
  targetDurationMinSec: number
  targetDurationIdealSec: number
  targetDurationMaxSec: number
  hookWindowSec: number
  captionStyle: 'seo-keyword-first' | 'conversational-trend'
  hashtagCount: number
  captionMaxLen: number
  nativeSoundImportance: 'high' | 'low'
  formatAvatar: number
  formatBroll: number
  formatScreencast: number
  customized: boolean
}

const PLATFORM_LABEL: Record<string, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram Reels',
  youtube: 'YouTube Shorts',
  telegram: 'Telegram',
}

const NUM_FIELDS: { key: keyof Profile; label: string; step?: number }[] = [
  { key: 'targetDurationMinSec', label: 'Duration min (s)' },
  { key: 'targetDurationIdealSec', label: 'Duration ideal (s)' },
  { key: 'targetDurationMaxSec', label: 'Duration max (s)' },
  { key: 'hookWindowSec', label: 'Hook window (s)' },
  { key: 'hashtagCount', label: 'Hashtag count' },
  { key: 'captionMaxLen', label: 'Caption max length' },
  { key: 'formatAvatar', label: 'Format: avatar', step: 0.1 },
  { key: 'formatBroll', label: 'Format: b-roll', step: 0.1 },
  { key: 'formatScreencast', label: 'Format: screencast', step: 0.1 },
]

export default function PlatformProfilesPage() {
  const { activeId: workspaceId } = useWorkspace()
  const apiFetch = useApiFetch()

  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingPlatform, setSavingPlatform] = useState<string | null>(null)
  const [savedPlatform, setSavedPlatform] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    setError('')
    try {
      const r = await apiFetch(`/workspaces/${workspaceId}/platform-profiles`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = (await r.json()) as { profiles: Profile[] }
      setProfiles(data.profiles)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [workspaceId, apiFetch])

  useEffect(() => {
    load()
  }, [load])

  function update(platform: string, patch: Partial<Profile>) {
    setProfiles((prev) => prev.map((p) => (p.platform === platform ? { ...p, ...patch } : p)))
    setSavedPlatform(null)
  }

  function formatSum(p: Profile): number {
    return Math.round((p.formatAvatar + p.formatBroll + p.formatScreencast) * 100) / 100
  }

  async function save(p: Profile) {
    if (!workspaceId) return
    if (!(p.targetDurationMinSec <= p.targetDurationIdealSec && p.targetDurationIdealSec <= p.targetDurationMaxSec)) {
      setError(`${PLATFORM_LABEL[p.platform]}: duration must be min ≤ ideal ≤ max`)
      return
    }
    if (Math.abs(formatSum(p) - 1) > 0.011) {
      setError(`${PLATFORM_LABEL[p.platform]}: format weights must sum to 1 (currently ${formatSum(p)})`)
      return
    }
    setSavingPlatform(p.platform)
    setError('')
    try {
      const { platform, customized: _c, ...body } = p
      void _c
      const r = await apiFetch(`/workspaces/${workspaceId}/platform-profiles/${platform}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      })
      if (!r.ok) {
        const e = (await r.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? `HTTP ${r.status}`)
      }
      const updated = (await r.json()) as Profile
      setProfiles((prev) => prev.map((x) => (x.platform === platform ? updated : x)))
      setSavedPlatform(platform)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSavingPlatform(null)
    }
  }

  async function reset(platform: string) {
    if (!workspaceId) return
    setSavingPlatform(platform)
    setError('')
    try {
      const r = await apiFetch(`/workspaces/${workspaceId}/platform-profiles/${platform}`, { method: 'DELETE' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const def = (await r.json()) as Profile
      setProfiles((prev) => prev.map((x) => (x.platform === platform ? def : x)))
      setSavedPlatform(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset')
    } finally {
      setSavingPlatform(null)
    }
  }

  if (loading) return <div className="flex items-center gap-2 text-sm text-gray-500"><Spinner /> Loading…</div>

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold mb-2">Platform Profiles</h1>
      <p className="text-sm text-gray-500 mb-6">
        Per-platform generation settings (video length, caption style, hook window, format mix).
        Defaults come from platform research; overrides here are used by idea, script and video
        generation for this workspace.
      </p>

      {error && <div className="mb-4"><ErrorBanner message={error} /></div>}

      <div className="flex flex-col gap-6">
        {profiles.map((p) => (
          <Card key={p.platform}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-medium">
                {PLATFORM_LABEL[p.platform] ?? p.platform}
                {p.customized
                  ? <span className="ml-2 text-xs rounded bg-indigo-100 text-indigo-700 px-2 py-0.5">customized</span>
                  : <span className="ml-2 text-xs rounded bg-gray-100 text-gray-500 px-2 py-0.5">default</span>}
              </h2>
              {savedPlatform === p.platform && <span className="text-xs text-green-600">Saved ✓</span>}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {NUM_FIELDS.map((f) => (
                <label key={f.key} className="text-xs text-gray-600 flex flex-col gap-1">
                  {f.label}
                  <Input
                    type="number"
                    step={f.step ?? 1}
                    value={String(p[f.key] as number)}
                    onChange={(e) => update(p.platform, { [f.key]: Number(e.target.value) } as Partial<Profile>)}
                  />
                </label>
              ))}
              <label className="text-xs text-gray-600 flex flex-col gap-1">
                Caption style
                <Select
                  value={p.captionStyle}
                  onChange={(e) => update(p.platform, { captionStyle: e.target.value as Profile['captionStyle'] })}
                >
                  <option value="seo-keyword-first">seo-keyword-first</option>
                  <option value="conversational-trend">conversational-trend</option>
                </Select>
              </label>
              <label className="text-xs text-gray-600 flex flex-col gap-1">
                Native sound
                <Select
                  value={p.nativeSoundImportance}
                  onChange={(e) => update(p.platform, { nativeSoundImportance: e.target.value as Profile['nativeSoundImportance'] })}
                >
                  <option value="high">high</option>
                  <option value="low">low</option>
                </Select>
              </label>
            </div>

            <p className={`mt-2 text-xs ${Math.abs(formatSum(p) - 1) > 0.011 ? 'text-red-500' : 'text-gray-400'}`}>
              Format mix sum: {formatSum(p)} (must be 1.0)
            </p>

            <div className="mt-4 flex items-center gap-2">
              <Button onClick={() => save(p)} disabled={savingPlatform === p.platform}>
                {savingPlatform === p.platform && <Spinner />} Save
              </Button>
              {p.customized && (
                <Button variant="secondary" onClick={() => reset(p.platform)} disabled={savingPlatform === p.platform}>
                  Reset to default
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
