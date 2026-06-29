'use client'

import { getAuthToken } from '@/lib/auth'
import { useParams } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { useWorkspace } from '@/lib/workspace'
import { useApiFetch, API_BASE } from '@/lib/api'
import { Link } from '@/i18n/navigation'
import { Button, Input, Select } from '@/components/ui'
import { useTranslations } from 'next-intl'

interface ContentPlanItem {
  id: string
  index: number
  topic: string
  format: string
  scheduledDate: string
  hook: string
  status: string
  rejectComment: string | null
  scriptId: string | null
  videoJobId: string | null
}

interface Campaign {
  id: string
  name: string
  goal: string
  targetAction: string
  startsAt: string
  endsAt: string
  status: string
  contentPlan: { id: string; status: string; items: ContentPlanItem[] } | null
}

interface ItemFormValues {
  topic: string
  hook: string
  format: string
  scheduledDate: string
}

interface CampaignFormValues {
  name: string
  goal: string
  targetAction: string
  startsAt: string
  endsAt: string
}

const ITEM_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-600',
  SCRIPTING: 'bg-blue-100 text-blue-700',
  SCRIPTED: 'bg-blue-100 text-blue-700',
  VIDEO_QUEUED: 'bg-yellow-100 text-yellow-700',
  VIDEO_GENERATING: 'bg-yellow-100 text-yellow-700',
  VIDEO_DONE: 'bg-blue-100 text-blue-700',
  CLIENT_REVIEW: 'bg-orange-100 text-orange-700',
  APPROVED: 'bg-green-100 text-green-700',
  PUBLISHED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
}

const IN_PROGRESS = new Set(['SCRIPTING', 'SCRIPTED', 'VIDEO_QUEUED', 'VIDEO_GENERATING'])

/** Convert an ISO date string to the YYYY-MM-DD format an <input type="date"> expects. */
function toDateInput(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10)
}

/**
 * Display a stored date. Dates are persisted as UTC midnight, so format in UTC to
 * avoid an off-by-one day in negative-offset timezones (which would also disagree
 * with the UTC-based edit-form prefill from toDateInput).
 */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { timeZone: 'UTC' })
}

export default function CampaignPage() {
  const t = useTranslations('studio')
  const apiFetch = useApiFetch()
  const { activeId: workspaceId } = useWorkspace()
  const params = useParams()
  const campaignId = params.id as string

  const ITEM_STATUS_LABELS: Record<string, string> = {
    PENDING: t('statusPending'),
    SCRIPTING: t('statusScripting'),
    SCRIPTED: t('statusScripted'),
    VIDEO_QUEUED: t('statusVideoQueued'),
    VIDEO_GENERATING: t('statusVideoGenerating'),
    VIDEO_DONE: t('statusVideoDone'),
    CLIENT_REVIEW: t('statusClientReview'),
    APPROVED: t('statusApproved'),
    PUBLISHED: t('statusPublished'),
    REJECTED: t('statusRejected'),
  }

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [approving, setApproving] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Editing state
  const [editingCampaign, setEditingCampaign] = useState(false)
  const [savingCampaign, setSavingCampaign] = useState(false)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [addingItem, setAddingItem] = useState(false)
  const [savingItem, setSavingItem] = useState(false)
  const [videoToken, setVideoToken] = useState<string | null>(null)
  const [watchingId, setWatchingId] = useState<string | null>(null)

  const fetchCampaign = useCallback(async () => {
    if (!workspaceId) return
    try {
      const res = await apiFetch(`/workspaces/${workspaceId}/campaigns/${campaignId}`)
      if (!res.ok) throw new Error('Failed to load campaign')
      setCampaign(await res.json() as Campaign)
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    finally { setLoading(false) }
  }, [workspaceId, campaignId, apiFetch])

  useEffect(() => { void fetchCampaign() }, [fetchCampaign])

  // Keep a fresh token for streaming finished videos through the API proxy
  // (a <video> tag can't send an Authorization header, so it goes in ?token=).
  useEffect(() => { setVideoToken(getAuthToken()) }, [campaign])

  useEffect(() => {
    if (!campaign?.contentPlan) return
    const planStatus = campaign.contentPlan.status
    // Poll only while actively producing — not after a Stop (DRAFT) or completion.
    const shouldPoll = planStatus === 'APPROVED' || planStatus === 'IN_PRODUCTION'
    if (!shouldPoll) return
    const timer = setInterval(() => { void fetchCampaign() }, 5_000)
    return () => clearInterval(timer)
  }, [campaign, fetchCampaign])

  async function handleGeneratePlan() {
    if (!workspaceId) return
    setGenerating(true)
    setError(null)
    try {
      const res = await apiFetch(`/workspaces/${workspaceId}/campaigns/${campaignId}/content-plan/generate`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error(await res.text())
      await fetchCampaign()
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    finally { setGenerating(false) }
  }

  async function handleApprovePlan() {
    if (!workspaceId) return
    setApproving(true)
    setError(null)
    try {
      const res = await apiFetch(`/workspaces/${workspaceId}/campaigns/${campaignId}/approve-plan`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error(await res.text())
      await fetchCampaign()
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    finally { setApproving(false) }
  }

  async function handleStop() {
    if (!workspaceId) return
    setStopping(true)
    setError(null)
    try {
      const res = await apiFetch(`/workspaces/${workspaceId}/campaigns/${campaignId}/content-plan/stop`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error(await res.text())
      await fetchCampaign()
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    finally { setStopping(false) }
  }

  async function saveCampaign(v: CampaignFormValues) {
    if (!workspaceId) return
    setSavingCampaign(true)
    setError(null)
    try {
      const res = await apiFetch(`/workspaces/${workspaceId}/campaigns/${campaignId}`, {
        method: 'PATCH',
        body: JSON.stringify(v),
      })
      if (!res.ok) throw new Error(await res.text())
      setEditingCampaign(false)
      await fetchCampaign()
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    finally { setSavingCampaign(false) }
  }

  async function saveNewItem(v: ItemFormValues) {
    if (!workspaceId) return
    setSavingItem(true)
    setError(null)
    try {
      const res = await apiFetch(`/workspaces/${workspaceId}/campaigns/${campaignId}/content-plan/items`, {
        method: 'POST',
        body: JSON.stringify(v),
      })
      if (!res.ok) throw new Error(await res.text())
      setAddingItem(false)
      await fetchCampaign()
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    finally { setSavingItem(false) }
  }

  async function saveItem(itemId: string, v: ItemFormValues) {
    if (!workspaceId) return
    setSavingItem(true)
    setError(null)
    try {
      const res = await apiFetch(`/workspaces/${workspaceId}/campaigns/${campaignId}/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify(v),
      })
      if (!res.ok) throw new Error(await res.text())
      setEditingItemId(null)
      await fetchCampaign()
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    finally { setSavingItem(false) }
  }

  async function deleteItem(itemId: string) {
    if (!workspaceId) return
    if (!window.confirm(t('deleteVideoConfirm'))) return
    setError(null)
    try {
      const res = await apiFetch(`/workspaces/${workspaceId}/campaigns/${campaignId}/items/${itemId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(await res.text())
      await fetchCampaign()
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') }
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">{t('loading')}</div>
  if (!campaign) return <div className="p-6 text-gray-500">{t('campaignNotFound')}</div>

  const planStatus = campaign.contentPlan?.status
  const items = campaign.contentPlan?.items ?? []
  const canGenerate = !planStatus || planStatus === 'DRAFT'
  const canApprove = planStatus === 'DRAFT' && items.length > 0
  const isProducing = planStatus === 'IN_PRODUCTION' || planStatus === 'APPROVED'
  const canEdit = !planStatus || planStatus === 'DRAFT'
  const canEditCampaign = !isProducing
  const doneCount = items.filter(i => ['CLIENT_REVIEW', 'APPROVED', 'PUBLISHED'].includes(i.status)).length

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Back navigation */}
      <Link href="/studio" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        {t('backToStudio')}
      </Link>

      <div className="flex items-start justify-between gap-4">
        {editingCampaign ? (
          <CampaignForm
            initial={{
              name: campaign.name,
              goal: campaign.goal,
              targetAction: campaign.targetAction,
              startsAt: toDateInput(campaign.startsAt),
              endsAt: toDateInput(campaign.endsAt),
            }}
            onSave={(v) => { void saveCampaign(v) }}
            onCancel={() => setEditingCampaign(false)}
            saving={savingCampaign}
          />
        ) : (
          <>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">{campaign.name}</h1>
              <p className="text-sm text-gray-500 mt-1">{t('campaignGoalDisplay')}: {campaign.targetAction}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {formatDate(campaign.startsAt)} — {formatDate(campaign.endsAt)}
              </p>
            </div>
            <div className="flex gap-2 shrink-0 flex-wrap justify-end items-center">
              {canEditCampaign && (
                <Button variant="secondary" size="sm" onClick={() => setEditingCampaign(true)}>
                  {t('editCampaign')}
                </Button>
              )}
              {canGenerate && (
                <button
                  onClick={() => { void handleGeneratePlan() }}
                  disabled={generating}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  {generating ? t('generating') : items.length > 0 ? t('regeneratePlan') : t('generatePlan')}
                </button>
              )}
              {canApprove && (
                <button
                  onClick={() => { void handleApprovePlan() }}
                  disabled={approving}
                  className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {approving ? t('starting') : t('approveStart')}
                </button>
              )}
              {isProducing && (
                <>
                  <span className="text-xs px-3 py-1.5 bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-lg self-center flex items-center gap-1.5">
                    <span className="animate-pulse">●</span>
                    {t('generatingVideos', { done: doneCount, total: items.length })}
                  </span>
                  <Button variant="danger" size="sm" loading={stopping} onClick={() => { void handleStop() }}>
                    {t('stopGeneration')}
                  </Button>
                </>
              )}
              {planStatus === 'COMPLETED' && (
                <span className="text-xs px-3 py-1.5 bg-green-50 border border-green-200 text-green-700 rounded-lg self-center">
                  {t('allVideosReady')}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

      {items.length === 0 && !addingItem ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center space-y-3">
          <p className="text-gray-500">{t('noContentPlan')}</p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => { void handleGeneratePlan() }}
              disabled={generating}
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {generating ? t('generating') : t('generateWithAi')}
            </button>
            {canEdit && (
              <Button variant="secondary" onClick={() => setAddingItem(true)}>{t('addVideoManually')}</Button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-gray-900">{t('contentPlan', { count: items.length })}</h2>
            {planStatus && (
              <span className={`text-xs px-2 py-1 rounded-full ${
                planStatus === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                planStatus === 'IN_PRODUCTION' || planStatus === 'APPROVED' ? 'bg-blue-100 text-blue-700' :
                'bg-gray-100 text-gray-600'
              }`}>{planStatus}</span>
            )}
          </div>
          {items.map(item => (
            <div key={item.id} className="bg-white border border-gray-200 rounded-xl p-4">
              {editingItemId === item.id ? (
                <PlanItemForm
                  initial={{
                    topic: item.topic,
                    hook: item.hook,
                    format: item.format,
                    scheduledDate: toDateInput(item.scheduledDate),
                  }}
                  onSave={(v) => { void saveItem(item.id, v) }}
                  onCancel={() => setEditingItemId(null)}
                  saving={savingItem}
                />
              ) : (
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-medium shrink-0">
                    {item.index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-gray-900">{item.topic}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${ITEM_STATUS_COLORS[item.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {ITEM_STATUS_LABELS[item.status] ?? item.status}
                      </span>
                      {IN_PROGRESS.has(item.status) && (
                        <span className="text-xs text-gray-400 animate-pulse">●</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1 italic">&quot;{item.hook}&quot;</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatDate(item.scheduledDate)} · {item.format}
                    </p>
                    {item.rejectComment && (
                      <p className="text-xs text-red-500 mt-1">{t('rejectedLabel')}: {item.rejectComment}</p>
                    )}
                    {item.videoJobId && (
                      <div className="mt-2">
                        <button
                          onClick={() => setWatchingId(watchingId === item.id ? null : item.id)}
                          className="text-xs text-indigo-600 hover:underline"
                        >
                          {watchingId === item.id ? t('hideVideo') : t('watchVideo')}
                        </button>
                        {watchingId === item.id && videoToken && (
                          <video
                            src={`${API_BASE}/workspaces/${workspaceId}/video-jobs/${item.videoJobId}/output?token=${encodeURIComponent(videoToken)}`}
                            controls
                            autoPlay
                            className="mt-2 rounded-lg bg-black w-full max-w-[240px]"
                            style={{ aspectRatio: '9/16' }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex gap-1 shrink-0">
                      {item.status === 'PENDING' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setEditingItemId(item.id); setAddingItem(false) }}
                        >
                          {t('edit')}
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => { void deleteItem(item.id) }}>
                        {t('delete')}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {canEdit && (
            addingItem ? (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <PlanItemForm
                  initial={{ topic: '', hook: '', format: 'reel', scheduledDate: toDateInput(campaign.startsAt) }}
                  onSave={(v) => { void saveNewItem(v) }}
                  onCancel={() => setAddingItem(false)}
                  saving={savingItem}
                />
              </div>
            ) : (
              <Button variant="secondary" onClick={() => setAddingItem(true)}>{t('addVideo')}</Button>
            )
          )}
        </div>
      )}
    </div>
  )
}

function PlanItemForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: ItemFormValues
  onSave: (v: ItemFormValues) => void
  onCancel: () => void
  saving: boolean
}) {
  const t = useTranslations('studio')
  const [topic, setTopic] = useState(initial.topic)
  const [hook, setHook] = useState(initial.hook)
  const [format, setFormat] = useState(initial.format)
  const [date, setDate] = useState(initial.scheduledDate)
  const valid = topic.trim() !== '' && hook.trim() !== '' && format.trim() !== '' && date !== ''

  return (
    <div className="space-y-2">
      <Input value={topic} onChange={e => setTopic(e.target.value)} placeholder={t('itemFormTopic')} />
      <textarea
        value={hook}
        onChange={e => setHook(e.target.value)}
        placeholder={t('itemFormHook')}
        rows={2}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm resize-none placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
      />
      <div className="flex gap-2">
        <Input
          value={format}
          onChange={e => setFormat(e.target.value)}
          placeholder={t('itemFormFormat')}
          className="flex-1"
        />
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={saving}>{t('cancel')}</Button>
        <Button
          size="sm"
          loading={saving}
          disabled={!valid}
          onClick={() => onSave({ topic: topic.trim(), hook: hook.trim(), format: format.trim(), scheduledDate: date })}
        >
          {t('save')}
        </Button>
      </div>
    </div>
  )
}

function CampaignForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: CampaignFormValues
  onSave: (v: CampaignFormValues) => void
  onCancel: () => void
  saving: boolean
}) {
  const t = useTranslations('studio')
  const [name, setName] = useState(initial.name)
  const [goal, setGoal] = useState(initial.goal)
  const [targetAction, setTargetAction] = useState(initial.targetAction)
  const [startsAt, setStartsAt] = useState(initial.startsAt)
  const [endsAt, setEndsAt] = useState(initial.endsAt)
  const valid = name.trim() !== '' && targetAction.trim() !== '' && startsAt !== '' && endsAt !== ''

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 w-full">
      <div>
        <label className="text-xs text-gray-500">{t('campaignFormName')}</label>
        <Input value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div>
        <label className="text-xs text-gray-500">{t('campaignFormGoal')}</label>
        <Select value={goal} onChange={e => setGoal(e.target.value)} className="w-full">
          <option value="SUBSCRIBERS">{t('goalSubscribers')}</option>
          <option value="SALES">{t('goalSales')}</option>
          <option value="ENGAGEMENT">{t('goalEngagement')}</option>
          <option value="REACH">{t('goalReach')}</option>
        </Select>
      </div>
      <div>
        <label className="text-xs text-gray-500">{t('campaignFormTargetAction')}</label>
        <Input value={targetAction} onChange={e => setTargetAction(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs text-gray-500">{t('campaignFormStarts')}</label>
          <input
            type="date"
            value={startsAt}
            onChange={e => setStartsAt(e.target.value)}
            className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-gray-500">{t('campaignFormEnds')}</label>
          <input
            type="date"
            value={endsAt}
            onChange={e => setEndsAt(e.target.value)}
            className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={saving}>{t('cancel')}</Button>
        <Button
          size="sm"
          loading={saving}
          disabled={!valid}
          onClick={() => onSave({ name: name.trim(), goal, targetAction: targetAction.trim(), startsAt, endsAt })}
        >
          {t('save')}
        </Button>
      </div>
    </div>
  )
}
