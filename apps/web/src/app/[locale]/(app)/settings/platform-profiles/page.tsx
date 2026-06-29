'use client'

import { useCallback, useEffect, useState } from 'react'
import { useWorkspace } from '@/lib/workspace'
import { useApiFetch } from '@/lib/api'
import { Button, Card, Input, Select, Spinner, ErrorBanner, EmptyState } from '@/components/ui/index'
import { useTranslations } from 'next-intl'

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

export default function PlatformProfilesPage() {
  const t = useTranslations('settings')
  const tCommon = useTranslations('common')
  const { activeId: workspaceId } = useWorkspace()
  const apiFetch = useApiFetch()

  const NUM_FIELDS: { key: keyof Profile; label: string; step?: number }[] = [
    { key: 'targetDurationMinSec', label: t('durationMin') },
    { key: 'targetDurationIdealSec', label: t('durationIdeal') },
    { key: 'targetDurationMaxSec', label: t('durationMax') },
    { key: 'hookWindowSec', label: t('hookWindow') },
    { key: 'hashtagCount', label: t('hashtagCount') },
    { key: 'captionMaxLen', label: t('captionMaxLen') },
    { key: 'formatAvatar', label: t('formatAvatar'), step: 0.1 },
    { key: 'formatBroll', label: t('formatBroll'), step: 0.1 },
    { key: 'formatScreencast', label: t('formatScreencast'), step: 0.1 },
  ]

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
    setSavedPlatform((prev) => (prev === platform ? null : prev))
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

  if (loading) return <div className="flex items-center gap-2 text-sm text-gray-500"><Spinner /> {tCommon('loading')}</div>

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold mb-2">{t('platformProfilesTitle')}</h1>
      <p className="text-sm text-gray-500 mb-6">
        {t('platformProfilesDesc')}
      </p>

      {error && <div className="mb-4"><ErrorBanner message={error} /></div>}

      {!loading && profiles.length === 0 && (
        <EmptyState
          title="No platform profiles"
          description="Platform profiles will appear here once your workspace finishes setting up."
          icon="⚙️"
        />
      )}

      <div className="flex flex-col gap-6">
        {profiles.map((p) => (
          <Card key={p.platform}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium">
                {PLATFORM_LABEL[p.platform] ?? p.platform}
                {p.customized
                  ? <span className="ml-2 text-xs rounded bg-indigo-100 text-indigo-700 px-2 py-0.5">{t('customized')}</span>
                  : <span className="ml-2 text-xs rounded bg-gray-100 text-gray-500 px-2 py-0.5">{t('default')}</span>}
              </h2>
              {savedPlatform === p.platform && <span className="text-xs text-green-600">{t('savedMark')}</span>}
            </div>

            {/* Duration group */}
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Duration (sec)</p>
              <div className="flex flex-wrap gap-3">
                {NUM_FIELDS.slice(0, 3).map((f) => (
                  <label key={f.key} className="text-xs text-gray-600 flex flex-col gap-1">
                    {f.label}
                    <Input
                      type="number"
                      step={f.step ?? 1}
                      value={String(p[f.key] as number)}
                      onChange={(e) => update(p.platform, { [f.key]: Number(e.target.value) } as Partial<Profile>)}
                      className="w-28"
                    />
                  </label>
                ))}
              </div>
            </div>

            {/* Other numeric fields + selects */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 mb-4">
              {NUM_FIELDS.slice(3, 6).map((f) => (
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
                {t('captionStyle')}
                <Select
                  value={p.captionStyle}
                  onChange={(e) => update(p.platform, { captionStyle: e.target.value as Profile['captionStyle'] })}
                >
                  <option value="seo-keyword-first">seo-keyword-first</option>
                  <option value="conversational-trend">conversational-trend</option>
                </Select>
              </label>
              <label className="text-xs text-gray-600 flex flex-col gap-1">
                {t('nativeSound')}
                <Select
                  value={p.nativeSoundImportance}
                  onChange={(e) => update(p.platform, { nativeSoundImportance: e.target.value as Profile['nativeSoundImportance'] })}
                >
                  <option value="high">high</option>
                  <option value="low">low</option>
                </Select>
              </label>
            </div>

            {/* Format mix group */}
            <div className="mb-2">
              <div className="flex items-center gap-3 mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Format Mix</p>
                <span className={`text-xs ${Math.abs(formatSum(p) - 1) > 0.011 ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                  {t('formatMixSum')}: {formatSum(p)} ({t('formatMixMustBe')})
                </span>
              </div>
              <div className="flex flex-wrap gap-3">
                {NUM_FIELDS.slice(6, 9).map((f) => (
                  <label key={f.key} className="text-xs text-gray-600 flex flex-col gap-1">
                    {f.label}
                    <Input
                      type="number"
                      step={f.step ?? 1}
                      value={String(p[f.key] as number)}
                      onChange={(e) => update(p.platform, { [f.key]: Number(e.target.value) } as Partial<Profile>)}
                      className="w-32"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <Button onClick={() => save(p)} disabled={savingPlatform === p.platform}>
                {savingPlatform === p.platform && <Spinner />} {tCommon('save')}
              </Button>
              {p.customized && (
                <Button variant="secondary" onClick={() => reset(p.platform)} disabled={savingPlatform === p.platform}>
                  {t('resetToDefault')}
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
